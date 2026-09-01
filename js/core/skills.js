/**
 * Skill text: loading, and — the point of this module — *overriding*.
 *
 * Until now the rationale-clash loop stopped at "here is a proposal, export
 * it as markdown and go edit the file yourself". That is not a feedback loop,
 * it is a suggestion box: nothing the user agreed to had any effect on the
 * next call.
 *
 * An override is an amendment appended to a skill's markdown, stored locally
 * and applied at prompt-assembly time, so the *very next* call to that skill
 * runs with the revised instructions. Overrides are plain text, listed and
 * revertible, and can be committed back to the repo through io/github.js —
 * the browser copy is the working draft, git is where it becomes permanent.
 */

import { logInfo, logWarn } from './log.js';
import { set } from './state.js';
import { t } from './i18n.js';
import { fetchAsset } from './net.js';

const STORE_KEY = 'annotator_skill_overrides';
const baseCache = new Map();     // relPath -> original file text
let overrides = load();          // relPath -> amendment text

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}
function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify(overrides));
}

/** The unmodified file as shipped in data/. */
export async function loadBaseText(relPath) {
  if (baseCache.has(relPath)) return baseCache.get(relPath);
  const res = await fetchAsset(`data/${relPath}`);
  const text = res.ok ? await res.text() : '';
  if (!res.ok) logWarn('skills', t('pipe.skillMissing', { path: relPath }));
  baseCache.set(relPath, text);
  return text;
}

/**
 * What the pipeline should actually send: base file + any accepted amendment.
 * This is the single place a skill edit takes effect.
 */
export async function loadEffectiveText(relPath) {
  const base = await loadBaseText(relPath);
  const amendment = overrides[relPath];
  if (!amendment) return base;
  return `${base}\n\n${t('skills.amendHeading')}\n\n${amendment}`;
}

export function getOverride(relPath) { return overrides[relPath] || ''; }
export function listOverrides() { return Object.entries(overrides).map(([file, text]) => ({ file, text })); }
export function hasOverride(relPath) { return Boolean(overrides[relPath]); }

/** Accept an amendment. Appends to any existing one rather than replacing it. */
export function addAmendment(relPath, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  overrides[relPath] = overrides[relPath] ? `${overrides[relPath]}\n\n${trimmed}` : trimmed;
  persist();
  logInfo('skills', t('skills.applied', { file: relPath }));
  // The next prompt already carries it (loadEffectiveText), but the annotator
  // cannot see that. Announce it so the assistant pane can show the amendment
  // on the spot rather than leaving them to take it on faith.
  set({}, 'skills');
  return overrides[relPath];
}

export function clearOverride(relPath) {
  delete overrides[relPath];
  persist();
  logInfo('skills', t('skills.reverted', { file: relPath }));
  set({}, 'skills');
}

export function clearAllOverrides() {
  overrides = {};
  persist();
  logInfo('skills', 'all local skill amendments reverted');
}

/** Full merged file text, for committing back to the repo. */
export async function mergedFileText(relPath) {
  return loadEffectiveText(relPath);
}
