#!/usr/bin/env node
// @ts-check

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testDirectory = join(root, 'test');

const files = (await readdir(testDirectory, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.test\.(?:c|m)?js$/.test(entry.name))
  .map((entry) => join(entry.parentPath || entry.path, entry.name))
  .sort();

if (files.length === 0) {
  throw new Error(`No Node tests found under ${testDirectory}`);
}

const child = spawn(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) console.error(`Node test runner stopped by ${signal}`);
  process.exitCode = code ?? 1;
});
