/**
 * Skill text: loading, and — the point of this module — *changing* it.
 *
 * A skill file IS the prompt. Everything this app does to improve annotation
 * eventually comes back to editing one of these files, so both ways of doing
 * that live here and both take effect on the very next call:
 *
 *   - an **amendment**, reached the long way round: a correction files an
 *     issue, a human reviews the batch, reflection drafts one rule, a human
 *     applies it. That is the loop for a rule you discovered by annotating.
 *   - a **rewrite**, reached by opening the file and typing. That is the loop
 *     for a typo, and for anything you already know.
 *
 * Changes are plain text, revertible, and can be committed back to the repo
 * through io/github.js — the browser copy is the working draft, git is where
 * it becomes permanent.
 *
 * The same store holds a skill's *code* when it has one (see the refine
 * chain's validate pass): it is a file in data/ with a local override, exactly
 * like the instructions, because it is the same kind of thing.
 */

import { logInfo, logWarn } from './log.js';
import { set } from './state.js';
import { t } from './i18n.js';
import { fetchAsset } from './net.js';

const STORE_KEY = 'annotator_skill_overrides';
const baseCache = new Map();     // relPath -> original file text

/**
 * relPath -> {mode, text}. Two kinds of local change, and the difference
 * matters to everything downstream:
 *
 *   amend   — an addition, reached through review and reflection, shown as an
 *             amendment beneath the original.
 *   replace — the annotator opened the file and rewrote it. There is no
 *             "original plus this"; there is just what they wrote.
 *
 * Older stores held a bare amendment string; those load as `amend`.
 */
let overrides = load();

function load() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === 'string' ? { mode: 'amend', text: v } : v;
  }
  return out;
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
  const over = overrides[relPath];
  if (!over) return base;
  if (over.mode === 'replace') return over.text;
  return `${base}\n\n${t('skills.amendHeading')}\n\n${over.text}`;
}

/**
 * The amendment in force, or '' — deliberately empty for a rewritten file.
 * "Here is what was added to the original" is a claim about an amendment; for a
 * rewrite there is no original left to add to, and the UI says something else.
 */
export function getOverride(relPath) {
  const over = overrides[relPath];
  return over && over.mode !== 'replace' ? over.text : '';
}
export function getOverrideInfo(relPath) { return overrides[relPath] || null; }

/**
 * Replace a skill file outright: the annotator opened it and wrote what it
 * should say. Saving it back unchanged clears the override instead of storing a
 * copy of the original, so "edited" keeps meaning something.
 */
export async function setFullText(relPath, text) {
  const base = await loadBaseText(relPath);
  if (String(text).trim() === String(base).trim()) { clearOverride(relPath); return false; }
  overrides[relPath] = { mode: 'replace', text: String(text) };
  persist();
  logInfo('skills', t('skills.rewritten', { file: relPath }));
  set({}, 'skills');
  return true;
}

/** Accept an amendment. Appends to any existing one rather than replacing it. */
export function addAmendment(relPath, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const prev = overrides[relPath];
  if (prev?.mode === 'replace') {
    // The file has been rewritten by hand. Append to what is actually in force,
    // not to a base text the annotator has already replaced.
    overrides[relPath] = { mode: 'replace', text: `${prev.text}\n\n${t('skills.amendHeading')}\n\n${trimmed}` };
  } else {
    overrides[relPath] = { mode: 'amend', text: prev ? `${prev.text}\n\n${trimmed}` : trimmed };
  }
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


