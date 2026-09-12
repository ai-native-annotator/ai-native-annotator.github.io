#!/usr/bin/env node
// @ts-check

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verificationDirectory = join(root, 'docs', 'verification');

const available = (await readdir(verificationDirectory))
  .filter((name) => name.endsWith('-test.js'))
  .sort();

if (process.argv.includes('--list')) {
  console.log(available.join('\n'));
  process.exit(0);
}

const requested = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const selected = requested.length
  ? requested.map((name) => (name.endsWith('.js') ? name : `${name}.js`))
  : available;

for (const name of selected) {
  if (!available.includes(name)) {
    throw new Error(`Unknown verification script: ${name}\nAvailable:\n${available.join('\n')}`);
  }
}

const noServer = process.argv.includes('--no-server');
const base =
  process.env.BASE ||
  (noServer ? 'http://127.0.0.1:8899' : `http://127.0.0.1:${await availablePort()}`);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const environment = {
  ...process.env,
  BASE: base,
  CHROME: process.env.CHROME || chromium.executablePath(),
};

/** @type {import('node:child_process').ChildProcess | undefined} */
let server;

if (!noServer) {
  const parsedBase = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(parsedBase.hostname)) {
    throw new Error('Set --no-server when BASE points at a non-local host.');
  }
  const port = parsedBase.port || (parsedBase.protocol === 'https:' ? '443' : '80');
  server = spawn('python3', ['serve.py', port], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  server.once('error', (error) => {
    console.error(`Could not start the local server: ${error.message}`);
  });
  await waitUntilReady(base);
}

let exitCode = 0;
try {
  for (const name of selected) {
    console.log(`\n=== ${name} ===`);
    const code = await run(process.execPath, [join(verificationDirectory, name)], environment);
    if (code !== 0) {
      exitCode = code;
      break;
    }
  }
} finally {
  await stopServer(server);
}

process.exitCode = exitCode;

/**
 * @param {string} command
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 */
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) console.error(`${args.at(-1)} stopped by ${signal}`);
      resolve(code ?? 1);
    });
  });
}

/** @param {string} url */
async function waitUntilReady(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`Local server exited with code ${server?.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server normally needs one or two polling intervals to bind.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local server did not become ready at ${url}`);
}

async function availablePort() {
  const probe = createServer();
  probe.unref();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => resolve());
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => probe.close(() => resolve()));
  if (!port) throw new Error('Could not allocate a local verification port');
  return port;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}
