/**
 * Skill call execution: the layer between "assemble this prompt" (pipeline.js)
 * and "get JSON back" (core/providers.js).
 *
 * Two modes, mirroring the Python side's `skill | model | workflow`
 * substitution:
 *
 *   replay : surface a call already recorded in the loaded document. Works
 *            offline. If nothing was recorded for this exact step (which is
 *            *expected* for any freshly-imported or hand-written document —
 *            there is nothing to replay), it fails loudly with a specific
 *            message instead of silently doing nothing. That failure is what
 *            tells the user to switch to live mode.
 *   live   : call the configured provider directly from the browser with the
 *            user's own key. No backend server, so the key never leaves the
 *            client except straight to the provider's API.
 *
 * Both return the same shape: {output, rationale, rawText, latencyMs, source, model}.
 */

import { state, traceKey } from './state.js';
import { callProvider, PROVIDERS } from './providers.js';
import { logInfo, logError, describeError } from './log.js';
import { t } from './i18n.js';
import { fingerprint } from '../domain/_value.js';
import { makeSkillId } from '../domain/feedback.js';
import { createRunRecord } from '../domain/runs.js';

let callSequence = 0;

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  try { return JSON.parse(body); } catch { /* fall through */ }
  const start = body.search(/[{[]/);
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(body.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }
  throw new Error(t('run.noJson', { body: body.slice(0, 300) }));
}

function rationaleOf(out) {
  if (!out || typeof out !== 'object') return '';
  if (typeof out.note === 'string') return out.note;
  if (out.structure && typeof out.structure.note === 'string') return out.structure.note;
  return '';
}

/**
 * Find a recorded call in the document's trace that matches this exact step,
 * for replay mode. `doc._trace` is built once per document (see
 * io/sources.js normalizeTree) as a flat index of every node ever recorded,
 * keyed by (skill, span).
 */
function findRecorded(skillId, stableSkillId, span) {
  const idx = state.doc?._trace;
  if (!idx) return null;
  const sentenceIndex = state.selectedSentence;
  return idx.get(traceKey(stableSkillId, span, sentenceIndex))
    || idx.get(traceKey(skillId, span, sentenceIndex))
    || null;
}

/**
 * Run one skill call. `span` identifies the call for replay lookup (usually
 * the phrase/sentence the skill was asked about).
 */
export async function runSkillCall({
  skillId,
  stableSkillId = '',
  revisionId = '',
  span,
  system,
  prompt,
  language,
}) {
  const canonicalSkillId = stableSkillId || legacyStableSkillId(skillId);
  const activeRevisionId = revisionId || 'rev:unversioned';
  const startedAt = new Date().toISOString();
  if (state.runMode === 'replay') {
    const recorded = findRecorded(skillId, canonicalSkillId, span);
    if (!recorded) {
      const traced = state.doc?._trace?.size || 0;
      logError('runner', `replay: no recorded call for "${skillId}" on "${truncate(span)}" (trace holds ${traced})`);
      throw new Error(traced
        ? t('run.replayGap', { skill: skillId, n: traced })
        : t('run.replayNoTrace', { skill: skillId }));
    }
    logInfo('runner', `replay: ${skillId} · ${truncate(span)}`);
    const result = {
      output: recorded.output, rationale: recorded.rationale || rationaleOf(recorded.output),
      rawText: recorded.rawText || '', latencyMs: 0, source: 'replay', model: recorded.model || '',
    };
    result.call = recorded.call || createExecutionRecord({
      localSkillId: skillId,
      stableSkillId: canonicalSkillId,
      revisionId: activeRevisionId,
      source: result.source,
      system,
      prompt,
      language,
      provider: 'recorded',
      model: result.model,
      result,
      startedAt,
    });
    return result;
  }

  // live
  const provider = state.provider;
  const apiKey = (state.apiKeys[provider] || '').trim();
  const model = (state.models[provider] || PROVIDERS[provider]?.defaultModel || '').trim();
  const t0 = performance.now();
  logInfo('runner', `live: ${skillId} · ${truncate(span)} · provider=${provider}`);
  let text;
  try {
    text = await callProvider(provider, { apiKey, model, system, prompt });
  } catch (err) {
    logError('runner', `${skillId} call failed: ${describeError(err)}`, err);
    throw err;
  }
  const latencyMs = performance.now() - t0;
  let output;
  try {
    output = extractJson(text);
  } catch (err) {
    logError('runner', `${skillId} response was not JSON: ${describeError(err)}`, { text });
    throw err;
  }
  logInfo('runner', `${skillId} done in ${Math.round(latencyMs)}ms`);
  const result = { output, rationale: rationaleOf(output), rawText: text, latencyMs, source: 'live', model };
  result.call = createExecutionRecord({
    localSkillId: skillId,
    stableSkillId: canonicalSkillId,
    revisionId: activeRevisionId,
    source: result.source,
    system,
    prompt,
    language,
    provider,
    model,
    result,
    startedAt,
  });
  return result;
}

/** Give old display ids (including internal names such as `(stop)`) a safe identity. */
function legacyStableSkillId(localSkillId) {
  const raw = String(localSkillId || 'unknown');
  try {
    return makeSkillId('legacy', raw);
  } catch {
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
    return makeSkillId('legacy', `${slug}-${fingerprint(raw).slice(0, 8)}`);
  }
}

export function createExecutionRecord({
  localSkillId,
  stableSkillId,
  revisionId,
  source,
  system = '',
  prompt,
  language,
  provider,
  model,
  result,
  startedAt,
}) {
  const id = typeof globalThis.crypto?.randomUUID === 'function'
    ? `call:${globalThis.crypto.randomUUID()}`
    : `call:${Date.now().toString(36)}:${(callSequence++).toString(36)}`;
  return createRunRecord({
    id,
    skillId: stableSkillId,
    localSkillId,
    revisionId,
    source: source || result.source,
    request: {
      prompt,
      language,
      provider,
      model,
      effectivePromptHash: fingerprint({ system: system || '', prompt: prompt || '' }),
      componentHashes: {
        system: fingerprint(system || ''),
        prompt: fingerprint(prompt || ''),
      },
    },
    response: {
      rawText: result.rawText,
      parsedOutput: result.output,
      rationale: result.rationale,
    },
    startedAt,
    latencyMs: result.latencyMs,
  });
}

function truncate(s, n = 40) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}
