// @ts-check

/**
 * Does the DEPLOYED site actually serve everything the page needs?
 *
 * Every other check in this repo runs against `serve.py`, which serves the
 * working tree exactly as it is on disk. A host does not have to. GitHub Pages
 * runs Jekyll unless told not to, and Jekyll silently drops every path whose
 * name begins with "_" — which took the whole site down: `js/domain/_value.js`
 * is imported by eight modules, and a 404 anywhere in an ES module graph fails
 * the entire graph, so the page rendered its static layout and ran no
 * JavaScript at all. Locally everything passed, because locally everything was
 * there.
 *
 * So this check asks the only question that matters after a deploy: walk the
 * module graph from index.html, fetch every module and every data file the
 * code names, and report anything the host will not hand over.
 *
 *   node scripts/check-deploy.mjs                       # the public site
 *   node scripts/check-deploy.mjs http://localhost:8899 # or any other origin
 */

const BASE = (process.argv[2] || 'https://ai-native-annotator.github.io').replace(/\/$/, '');

/**
 * Paths named as strings in the source rather than imported — fetched at
 * runtime. Two spellings, because core/skills.js prepends `data/` itself: the
 * code says `'skills/shared/_node_schema.md'` and the browser asks for
 * `data/skills/shared/_node_schema.md`. Matching only the written form would
 * have missed one of the two files this whole check exists for.
 */
const RUNTIME_ASSET =
  /['"`]((?:data\/|skills\/|importers\/|reference\/|demo\/|samples\/|resources\/)[A-Za-z0-9_./-]+\.(?:md|json|js|txt|py))['"`]/g;
const DATA_PREFIXED = /^(?:skills|importers|reference|demo|samples|resources)\//;
const IMPORT_SPECIFIER = /(?:^|[^\w$])(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const SCRIPT_SRC = /<script[^>]+src=["']([^"']+)["']/g;

const seen = new Set();
const missing = [];
const queue = [];

/** Resolve a specifier against the path it appeared in, keeping it site-relative. */
function resolvePath(fromPath, specifier) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return null; // absolute URL — not ours
  const base = specifier.startsWith('/') ? '' : fromPath.replace(/[^/]*$/, '');
  const parts = `${base}${specifier.replace(/^\//, '')}`.split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function enqueue(path) {
  if (!path || seen.has(path)) return;
  seen.add(path);
  queue.push(path);
}

async function main() {
  console.log(`checking ${BASE}`);
  enqueue('index.html');

  while (queue.length) {
    const path = queue.shift();
    let res;
    try {
      res = await fetch(`${BASE}/${path}`);
    } catch (error) {
      missing.push({ path, why: `fetch failed: ${error.message}` });
      continue;
    }
    if (!res.ok) {
      missing.push({ path, why: `HTTP ${res.status}` });
      continue;
    }
    const body = await res.text();

    // A host that 404s into an HTML error page still answers 200 on some
    // setups; a module that is really HTML fails the graph just the same.
    if (path.endsWith('.js') && /^\s*<!doctype html>/i.test(body)) {
      missing.push({ path, why: 'served an HTML page instead of JavaScript' });
      continue;
    }

    if (path.endsWith('.html')) {
      for (const [, src] of body.matchAll(SCRIPT_SRC)) enqueue(resolvePath(path, src));
    }
    if (path.endsWith('.js')) {
      for (const pattern of [IMPORT_SPECIFIER, DYNAMIC_IMPORT]) {
        for (const [, spec] of body.matchAll(pattern)) {
          if (spec.startsWith('.') || spec.startsWith('/')) enqueue(resolvePath(path, spec));
        }
      }
      for (const [, asset] of body.matchAll(RUNTIME_ASSET)) {
        enqueue(DATA_PREFIXED.test(asset) ? `data/${asset}` : asset);
      }
    }
  }

  console.log(`fetched ${seen.size} file(s)`);
  if (!missing.length) {
    console.log('OK — the host serves every file the page reaches for');
    return;
  }
  console.log(`\n${missing.length} file(s) the host will not serve:`);
  for (const { path, why } of missing) console.log(`  ${why.padEnd(12)} ${path}`);
  if (missing.some((m) => m.path.split('/').some((seg) => seg.startsWith('_')))) {
    console.log('\nPaths beginning with "_" are dropped by Jekyll. A `.nojekyll`');
    console.log('file at the repository root turns that off.');
  }
  process.exitCode = 1;
}

main();
