import { readFile } from 'node:fs/promises';

/**
 * The application is made of browser ES modules but intentionally has no root
 * `type: module`. Load only the new domain/application/adapter layers as ESM
 * during Node tests, without changing how the static site or its legacy
 * verification files are interpreted.
 */
export async function load(url, context, nextLoad) {
  if (
    url.startsWith('file:') &&
    /\/js\/(?:domain|application|adapters)\/.*\.js$/.test(new URL(url).pathname)
  ) {
    return {
      format: 'module',
      source: await readFile(new URL(url), 'utf8'),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
