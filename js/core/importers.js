/**
 * How a file becomes a document — per format, and changeable.
 *
 * This used to be a single hard-coded function in io/sources.js: split on
 * newlines, guess the language, done. That is the right reader for a plain
 * text file and the wrong one for every corpus anybody actually has. A CoNLL-U
 * treebank, a tab-separated export, one-JSON-per-line — each needs a different
 * cut, and "the tool cannot read my files" should be something you fix in the
 * tool, not something you file a bug about.
 *
 * So the readers are separate, named things: shipped ones are files under
 * `data/importers/`, and a format can be given its own — described in a
 * sentence, drafted by the model, edited by hand, stored on its own. Each
 * format remembers its own choice, because a UMR corpus and a sentiment corpus
 * do not arrive in the same shape.
 *
 * An importer returns a DOCUMENT: text cut into sentences. Never an
 * annotation — that is what skills are for, and which method annotates it is a
 * separate choice again (core/work.js).
 */

import { logInfo, logWarn } from './log.js';
import { set } from './state.js';
import { t } from './i18n.js';
import { fetchAsset } from './net.js';
import { runUserCode, sandboxAvailable } from './sandbox.js';

const STORE_KEY = 'annotator_importers';
const ENTRY = 'parse';

/** Readers that ship with the app. `file` is fetched, shown, and run as-is. */
export const BUILTIN = [
  { id: 'plain-text', file: 'importers/plain-text.js', get label() { return t('imp.plainText'); } },
  { id: 'conllu', file: 'importers/conllu.js', get label() { return t('imp.conllu'); } },
];

const sourceCache = new Map();          // file -> text
let custom = load();                    // formatId -> {name, source, updatedAt}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}
function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify(custom));
}

export async function builtinSource(file) {
  if (sourceCache.has(file)) return sourceCache.get(file);
  const res = await fetchAsset(`data/${file}`);
  const text = res.ok ? await res.text() : '';
  if (!res.ok) logWarn('importers', t('imp.missing', { file }));
  sourceCache.set(file, text);
  return text;
}

/* ------------------------------------------------------------ per format */

export function getImporter(formatId) { return custom[formatId] || null; }
export function listImporters() { return Object.entries(custom).map(([format, v]) => ({ format, ...v })); }

export function setImporter(formatId, source, name = '') {
  custom[formatId] = { name: name || t('imp.customName'), source, updatedAt: new Date().toISOString() };
  persist();
  logInfo('importers', t('imp.saved', { format: formatId }));
  set({}, 'importers');
}

export function clearImporter(formatId) {
  delete custom[formatId];
  persist();
  logInfo('importers', t('imp.cleared', { format: formatId }));
  set({}, 'importers');
}

/* --------------------------------------------------------------- running */

/**
 * Read `text` with whatever reader this format is using.
 *
 * Returns null when the format has no importer of its own, so the caller can
 * fall back to the built-in path rather than this module having to know what
 * the fallback is.
 */
export async function importWith(formatId, text, filename) {
  const importer = custom[formatId];
  if (!importer?.source) return null;
  if (!sandboxAvailable()) throw new Error(t('sandbox.unavailable', { err: 'Worker' }));
  const raw = await runUserCode(importer.source, ENTRY, [text, filename]);
  const doc = normalizeImported(raw, filename, text);
  logInfo('importers', t('imp.used', { format: formatId, n: doc.sentences.length }));
  return doc;
}

/** Run a reader without adopting it, so the editor can show what it would do. */
export async function tryImporter(source, text, filename = 'sample.txt') {
  const raw = await runUserCode(source, ENTRY, [text, filename]);
  return normalizeImported(raw, filename, text);
}

/**
 * Make a returned value safe to hand the rest of the app.
 *
 * Generated code gets this wrong in ordinary ways — a bare array of strings, a
 * missing language, no `index` — and every one of those would surface much
 * later as a broken pane. Fixing what is fixable and refusing what is not, here
 * and loudly, is the difference between a bad importer and a bad afternoon.
 */
export function normalizeImported(raw, filename, sourceText = '') {
  if (!raw || typeof raw !== 'object') throw new Error(t('imp.notObject'));
  const list = Array.isArray(raw) ? raw : raw.sentences;
  if (!Array.isArray(list)) throw new Error(t('imp.noSentences'));

  const sentences = list.map((s, i) => {
    const item = typeof s === 'string' ? { text: s } : (s || {});
    const text = String(item.text ?? '').trim();
    return {
      ...item,
      index: Number.isFinite(item.index) ? item.index : i + 1,
      text,
      tokens: Array.isArray(item.tokens) && item.tokens.length ? item.tokens : defaultTokens(text),
    };
  }).filter((s) => s.text);

  if (!sentences.length) throw new Error(t('imp.empty'));
  const base = Array.isArray(raw) ? {} : raw;
  return {
    ...base,
    id: base.id || filename.replace(/\.[^.]+$/, ''),
    language: base.language || (/[一-鿿]/.test(sourceText || sentences[0].text) ? 'zh' : 'en'),
    provenance: base.provenance || `imported: ${filename}`,
    sentences,
  };
}

function defaultTokens(line) {
  if (/\s/.test(line)) return line.split(/\s+/).filter(Boolean);
  return /[一-鿿]/.test(line) ? [...line] : [line];
}

/* ------------------------------------------------------------- authoring */

/**
 * The instructions a model gets when asked to write a reader. Kept here, next
 * to the contract it describes, so the two cannot drift apart.
 */
export function importerPrompt(description, sample) {
  return [
    'Write a JavaScript function that reads one corpus file into a document.',
    '',
    'Requirements:',
    `- Define exactly one top-level function named \`${ENTRY}(text, filename)\`.`,
    '- Return `{ id, language, sentences: [{ text, tokens }] }`.',
    '  `language` is "en" or "zh". `tokens` is an array of token strings.',
    '  Keep any extra per-sentence fields your format has (columns, ids, offsets)',
    '  on the sentence object; nothing should be thrown away.',
    '- Return the TEXT only, cut into sentences. Do not invent annotations.',
    '- Plain ES2020. No imports, no fetch, no DOM — it runs in a bare worker.',
    '- No markdown fences in your answer: reply with the JavaScript source only.',
    '',
    `## What this format's files look like`,
    description || '(no description given — infer it from the sample)',
    '',
    '## A sample of one file',
    '```',
    (sample || '').slice(0, 4000),
    '```',
  ].join('\n');
}

/** Strip the fences a model adds even when told not to. */
export function cleanGeneratedCode(text) {
  const fenced = /```(?:javascript|js)?\s*([\s\S]*?)```/.exec(String(text || ''));
  return (fenced ? fenced[1] : String(text || '')).trim();
}
