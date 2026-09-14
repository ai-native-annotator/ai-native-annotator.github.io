/**
 * Central store + tiny pub/sub.
 *
 * One mutable state object, one `emit` per change. Panes subscribe to the
 * keys they care about, so no pane needs to know about any other pane.
 *
 * `state.log` is a first-class part of the store (not console-only) so every
 * skill call — success or failure — is visible in the UI itself. Nothing
 * gets to fail silently: see core/log.js.
 */

const listeners = new Map(); // key -> Set<fn>

export const state = {
  formatId: 'umr',        // active annotation format
  doc: null,              // {id, format, language, sentences:[...]}
  docIndex: [],           // available demo docs
  selectedSentence: 0,    // index into doc.sentences
  selectedNode: null,     // {path:[...], node} — the skill call under inspection
  collapsed: new Set(),   // node paths the user explicitly collapsed (everything else defaults open)
  theme: 'json',          // per-format render theme (umr: json | penman)
  runMode: 'replay',      // replay (recorded) | live (call a real model)
  provider: 'anthropic',  // active LLM provider id
  apiKeys: {},            // provider id -> key, mirrors localStorage (see settings.js)
  models: {},             // provider id -> model override
  running: new Set(),     // path-keys currently mid-flight (for spinners/disabling)
  sweeping: false,        // a "run the rest" sweep owns the sentence right now
  lang: 'en',             // interface language; first run follows the browser (i18n.detectLang)
  editMode: 'penman',     // how the assistant's edit box shows output ('penman' | 'json')
  collapsed_panes: [],    // pane ids the user folded away ('source'|'skills'|'annotated'|'assistant')
  openSkill: null,        // skill id whose detail view is open, for the panel's highlight
  selectedPass: null,     // index of the chain pass under inspection (chained formats)
  edits: new Map(),       // editKey -> human-edited output (also written through onto node.output)
  proposals: [],          // skill-update proposals from rationale clashes
  // One conversation PER NODE, keyed by threadKey() below, plus a 'general'
  // thread for document-level questions. A single shared log made every
  // node's argument bleed into every other node's; an argument about one
  // skill call is its own thread and belongs with that call.
  chats: {},              // threadKey -> [{role, text, skill?, path?}]
  log: [],                // {ts, level, source, message, detail?} — visible activity log
  github: {               // GitHub connection (token kept in localStorage, mirrored here)
    token: '', user: null, owner: '', repo: '', branch: '',
  },
  voice: { ttsEnabled: false, listening: false },
};

export function on(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

export function emit(...keys) {
  for (const key of keys) {
    for (const fn of listeners.get(key) || []) fn(state);
  }
}

/** Set fields and notify, in one call: `set({doc}, 'doc', 'tree')`. */
export function set(patch, ...keys) {
  Object.assign(state, patch);
  emit(...(keys.length ? keys : Object.keys(patch)));
}

/** Stable identity for a node in the annotation tree. */
export const pathKey = (path) => path.join('.');

/**
 * Key for `doc._trace`, the replay index. Defined here, in the one module both
 * sides import, because it is written by io/sources.js and read by
 * core/runner.js: when those two built the string independently they silently
 * drifted apart (one used a space, the other a stray NUL) and *every* replay
 * lookup missed — with a message blaming the document for having no recording.
 */
export const traceKey = (skill, span, sentenceIndex = 0) =>
  `${sentenceIndex}${SEP}${skill}${SEP}${span}`;

/**
 * Key for a human edit. Scoped by sentence for the same reason threadKey is:
 * path [0,1] is a different node in sentence 1 than in sentence 2, and an edit
 * that leaked across sentences would silently rewrite someone else's node.
 */
export const editKey = (sentenceIndex, path) => `s${sentenceIndex}:${pathKey(path)}`;
const SEP = String.fromCharCode(31);   // ASCII unit separator: cannot occur in a skill id or a span

export function currentSentence() {
  return state.doc?.sentences?.[state.selectedSentence] || null;
}

/**
 * Which conversation the chat pane is showing. Node threads are scoped by
 * sentence as well as path, because path indices repeat across sentences —
 * `[0,1]` in sentence 1 is a different node from `[0,1]` in sentence 2.
 */
export function threadKey(sentenceIndex = state.selectedSentence, path = state.selectedNode?.path) {
  return path ? `s${sentenceIndex}:${pathKey(path)}` : 'general';
}

export function currentThread() {
  return state.chats[threadKey()] || [];
}

export function pushToThread(key, message) {
  if (!state.chats[key]) state.chats[key] = [];
  state.chats[key].push(message);
}

// persist the few things worth persisting (no backend by design). API keys
// and the GitHub token live in their own localStorage keys (settings.js /
// io/github.js) so they can be exported/imported as a standalone file.
const PERSIST = ['runMode', 'theme', 'formatId', 'provider', 'models', 'lang', 'editMode', 'collapsed_panes'];
export function loadPersisted() {
  try {
    const saved = JSON.parse(localStorage.getItem('annotator') || '{}');
    for (const k of PERSIST) if (saved[k] !== undefined) state[k] = saved[k];
  } catch { /* first run */ }
}
export function persist() {
  const out = {};
  for (const k of PERSIST) out[k] = state[k];
  localStorage.setItem('annotator', JSON.stringify(out));
}
