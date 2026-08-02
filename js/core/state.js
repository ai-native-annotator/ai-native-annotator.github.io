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
  edits: new Map(),       // path -> human-edited output
  proposals: [],          // skill-update proposals from rationale clashes
  chat: [],               // {role, text, skill?, path?}
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

export function currentSentence() {
  return state.doc?.sentences?.[state.selectedSentence] || null;
}

// persist the few things worth persisting (no backend by design). API keys
// and the GitHub token live in their own localStorage keys (settings.js /
// io/github.js) so they can be exported/imported as a standalone file.
const PERSIST = ['runMode', 'theme', 'formatId', 'provider', 'models'];
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
