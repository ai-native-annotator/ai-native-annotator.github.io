// @ts-check

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('all JSON assets parse', async () => {
  const files = await walk(root);
  const jsonFiles = files.filter(
    (file) => extname(file) === '.json' && !file.includes(`${join(root, 'node_modules')}/`),
  );

  const failures = [];
  for (const file of jsonFiles) {
    try {
      JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      failures.push(`${file.slice(root.length + 1)}: ${errorMessage(error)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('every static relative module import resolves to a file', async () => {
  const modules = (await walk(join(root, 'js'))).filter((file) => extname(file) === '.js');
  const failures = [];
  const patterns = [
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const file of modules) {
    const source = await readFile(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        if (!(await isFile(target))) {
          failures.push(`${file.slice(root.length + 1)} -> ${specifier}`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('the Python manifest is what scripts/build_manifest.py writes, and every path has a file', async () => {
  const base = join(root, 'data', 'skillparse');
  const manifest = JSON.parse(await readFile(join(base, 'MANIFEST.json'), 'utf8'));
  const missing = [];
  for (const source of [...Object.values(manifest.files), ...manifest.vendor]) {
    if (!(await isFile(join(base, source)))) missing.push(source);
  }
  assert.deepEqual(missing, []);

  // a file added, moved or deleted under data/skillparse/ without the manifest written again
  // is a file the page's Python never gets (or a 404 at boot)
  const built = spawnSync(
    'python3',
    ['-c', 'import json, build_manifest; print(json.dumps(build_manifest.manifest()))'],
    { cwd: join(root, 'scripts'), encoding: 'utf8' },
  );
  assert.equal(built.status, 0, built.stderr);
  assert.deepEqual(manifest, JSON.parse(built.stdout), 'run: python3 scripts/build_manifest.py');
});

test('index.html has unique ids and valid local scripts and stylesheets', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\sid=['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);

  const resources = [...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((path) => !/^(?:data:|https?:|\/\/|#)/.test(path));
  const missing = [];
  for (const resource of resources) {
    if (!(await isFile(join(root, resource)))) missing.push(resource);
  }
  assert.deepEqual(missing, []);
});

test('the host is told not to run Jekyll over the site', async () => {
  // GitHub Pages runs Jekyll unless a `.nojekyll` file says otherwise, and
  // Jekyll drops every path whose name starts with "_". The page's Python
  // imports two packages by their __init__.py, which the worker fetches; a 404
  // there stops Python from booting, while every local check passes, because
  // serve.py hands over the underscore files happily.
  assert.ok(
    await isFile(join(root, '.nojekyll')),
    '.nojekyll is missing: the deployed site will 404 every "_"-prefixed path',
  );

  // If that file is ever lost, these are the paths that take the site down
  // with it. Listing them keeps the cost of removing it visible.
  const atRisk = (await walk(join(root, 'js')))
    .concat(await walk(join(root, 'data')))
    .map((file) => file.slice(root.length + 1))
    .filter((path) => path.split('/').some((segment) => segment.startsWith('_')));
  assert.deepEqual(
    atRisk.sort(),
    [
      'data/skillparse/engine/input_handler/__init__.py',
      'data/skillparse/engine/output_handler/__init__.py',
    ],
    'a new "_"-prefixed runtime path appeared; keep .nojekyll and update this list',
  );
});

test('browser verification does not depend on a machine-specific module path', async () => {
  const readme = await readFile(join(root, 'docs', 'verification', 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /NODE_PATH\s*=|npm root -g/);

  const scripts = (await walk(join(root, 'docs', 'verification'))).filter(
    (file) => extname(file) === '.js',
  );
  for (const file of scripts) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /NODE_PATH\s*=|\/opt\/pw-browsers|\/Applications\/Google Chrome\.app/,
      file.slice(root.length + 1),
    );
  }
});

/** @param {string} directory */
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== '.git' && entry.name !== 'node_modules')
      .map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
      }),
  );
  return nested.flat();
}

/** @param {string} path */
async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
