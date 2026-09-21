// @ts-check

import assert from 'node:assert/strict';
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

test('demo manifest entries point to matching, well-sized documents', async () => {
  const demoDirectory = join(root, 'data', 'demo');
  const manifest = JSON.parse(await readFile(join(demoDirectory, 'index.json'), 'utf8'));
  const ids = manifest.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'demo ids must be unique');

  for (const entry of manifest) {
    const document = JSON.parse(await readFile(join(demoDirectory, `${entry.id}.json`), 'utf8'));
    assert.equal(document.id, entry.id, `${entry.id}: document id`);
    assert.equal(document.sentences.length, entry.sentences, `${entry.id}: sentence count`);
  }
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
  // Jekyll drops every path whose name starts with "_". Two of ours do:
  // js/domain/_value.js, which eight modules import, and
  // data/skills/shared/_node_schema.md, which four prompts include. A 404
  // anywhere in an ES module graph fails the whole graph, so the deployed site
  // served its static layout and ran no JavaScript at all — while every local
  // check passed, because serve.py hands over the underscore files happily.
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
    ['data/skills/shared/_node_schema.md', 'js/domain/_value.js'],
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
