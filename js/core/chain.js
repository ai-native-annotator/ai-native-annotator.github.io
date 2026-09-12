/**
 * Chained passes: a third shape of annotation work.
 *
 * The two shapes that already exist both assume a skill call owns a *piece* of
 * the sentence:
 *   - serial/recursive (umr): a call decomposes a span and spawns calls on the
 *     parts, so results form a tree and the parent/child relation is real.
 *   - flat/parallel (sentiment): independent calls on the same sentence, in
 *     any order, none of them looking at each other's output.
 *
 * Refinement is neither. A model drafts the WHOLE graph in one shot, and then
 * each pass rewrites that whole graph — fixing rolesets, then aspect, then
 * entities, and so on. Every pass takes the previous pass's output as its
 * input, so they are strictly ordered but not nested: a chain, not a tree.
 *
 * Modelling it as a tree would have been the easy mistake. Pass 3 is not a
 * child of pass 2 — it does not analyse a part of it, it supersedes it. What
 * matters at each step is therefore not "what did this node decompose into"
 * but "what did this pass CHANGE", which is why every pass stores the graph
 * before and after, and the UI shows a diff rather than a subtree.
 */

import { createExecutionRecord, runSkillCall } from './runner.js';
import { runUserCode } from './sandbox.js';
import { getActiveRevisionId, loadEffectiveText } from './skills.js';
import { extractJson } from './runner.js';
import { logInfo, logWarn } from './log.js';
import { parsePenman, toPenman } from './penman.js';
import { t } from './i18n.js';

/**
 * Assemble one pass as {system, prompt}: the stable instructions in `system`
 * (cached by the provider across every pass in the session), the graph and the
 * task in `prompt`, where they belong — they change every call.
 */
async function buildPassPrompt(def, sentence, graph, language) {
  const parts = [await loadEffectiveText(def.file, def.skillId)];
  const overlay = await loadEffectiveText(`skills/${language}/overlay.md`);
  if (overlay) parts.push(overlay);
  const task = [
    '## Task input',
    `Sentence: ${sentence.text}`,
    sentence.tokens?.length ? `Tokens: ${sentence.tokens.join(' ')}` : '',
    '',
    graph ? 'Current UMR graph (Penman):' : 'There is no graph yet — produce the first draft.',
    graph ? '```\n' + graph + '\n```' : '',
    '',
    'Return JSON only:',
    '{"graph": "<the complete revised Penman graph>",',
    ' "changes": ["one short line per change you made"],',
    ' "note": "one sentence on why"}',
    'If nothing needs changing, return the graph unchanged and an empty changes list.',
  ].filter(Boolean).join('\n');
  return {
    system: parts.filter(Boolean).join('\n\n---\n\n'),
    prompt: task,
    stableSkillId: def.skillId,
    revisionId: getActiveRevisionId(def.skillId),
  };
}

/**
 * Run one pass over the whole graph.
 *
 * The pass is trusted to return a complete graph, but not blindly: an
 * unparseable answer keeps the previous graph rather than replacing a good
 * draft with a broken one, and says so. Losing a working graph to a malformed
 * response would be the worst possible failure here, since every later pass
 * builds on it.
 */
export async function runPass(doc, sentenceIndex, passIndex, format) {
  const sentence = doc.sentences[sentenceIndex];
  const def = (format.skills || [])[passIndex];
  if (!def) throw new Error(t('chain.noPass', { n: passIndex }));

  sentence.passes = sentence.passes || [];
  const before = passIndex === 0 ? '' : (sentence.passes[passIndex - 1]?.graph || sentence.graph || '');
  const language = doc.language || 'en';

  // A pass that carries code runs the code. Same contract either way — read the
  // whole graph, return the whole graph — so the chain does not care which kind
  // of pass this is, and neither does the diff.
  let res;
  if (def.code) {
    res = await runCodePass(def, sentence, before, language);
  } else {
    const call = await buildPassPrompt(def, sentence, before, language);
    res = { ...await runSkillCall({ skillId: def.id, span: sentence.text, ...call, language }),
      input: call.prompt };
  }

  let out = res.output;
  // replay records may hold the raw text rather than the object
  if (typeof out === 'string') { try { out = extractJson(out); } catch { out = { graph: out }; } }

  let graph = String(out?.graph || '').trim();
  let warning = '';
  if (!graph) {
    graph = before;
    warning = t('chain.emptyGraph', { pass: def.id });
    logWarn('chain', warning);
  } else {
    // parsePenman is deliberately tolerant — it recovers from junk rather than
    // throwing — so "it returned something" is not the same as "this is a
    // graph". The minimum a UMR graph must have is a rooted `(v / concept)`,
    // so that is what gets checked. Keep the text either way (it may still be
    // readable, and the annotator needs to see what the pass actually said),
    // but flag it: a pass that broke the graph has broken the chain's
    // invariant, and every pass after it would inherit the damage.
    const parsed = parsePenman(graph);
    if (!parsed || !parsed.concept) {
      warning = t('chain.unparseable', { pass: def.id });
      logWarn('chain', warning);
    }
  }

  const record = {
    pass: def.id,
    label: def.label,
    before,
    graph,
    changes: Array.isArray(out?.changes) ? out.changes : [],
    note: out?.note || res.rationale || '',
    warning,
    source: res.source,
    model: res.model || '',
    latencyMs: res.latencyMs || 0,
    input: res.input,
    rawText: res.rawText || '',
    callId: res.call?.id || '',
    skillId: res.call?.skillId || res.stableSkillId || def.skillId,
    revisionId: res.call?.revisionId || res.revisionId || getActiveRevisionId(def.skillId),
    call: res.call || null,
    ranAt: new Date().toISOString(),
  };
  sentence.passes[passIndex] = record;
  // The document's graph is always the latest pass's output.
  sentence.graph = graph;
  logInfo('chain', t('chain.ran', { pass: def.id, n: record.changes.length }));
  return record;
}

/**
 * Run a pass whose step is code. The source is loaded through core/skills.js
 * like any other skill file, so a hand-edited version is what runs — and it
 * executes in the worker sandbox, not in the page.
 */
async function runCodePass(def, sentence, graph, language) {
  const stableSkillId = `${def.skillId}/code`;
  const source = await loadEffectiveText(def.code, stableSkillId);
  if (!source.trim()) throw new Error(t('chain.noCode', { pass: def.id, file: def.code }));
  const revisionId = getActiveRevisionId(stableSkillId);
  const startedAt = new Date().toISOString();
  const context = {
    sentence: sentence.text, tokens: sentence.tokens || [], language,
  };
  const t0 = performance.now();
  const out = await runUserCode(source, 'run', [graph, context]);
  const latencyMs = performance.now() - t0;
  logInfo('chain', t('chain.ranCode', { pass: def.id }));
  const result = {
    output: out,
    rationale: out?.note || '',
    source: 'code',
    model: '',
    latencyMs,
    rawText: JSON.stringify(out),
    input: t('chain.codeInput', { file: def.code }),
    stableSkillId,
    revisionId,
  };
  result.call = createExecutionRecord({
    localSkillId: def.id,
    stableSkillId,
    revisionId,
    source: 'code',
    system: source,
    prompt: JSON.stringify({ graph, context }),
    language,
    provider: 'local-sandbox',
    model: 'javascript',
    result,
    startedAt,
  });
  return result;
}

/** Index of the next pass that has not run, or -1 when the chain is finished. */
export function nextPassIndex(sentence, format) {
  const passes = sentence?.passes || [];
  const total = (format.skills || []).length;
  for (let i = 0; i < total; i++) if (!passes[i]) return i;
  return -1;
}

export function chainDone(sentence, format) {
  return nextPassIndex(sentence, format) === -1 && (format.skills || []).length > 0;
}

/**
 * Line diff between two Penman graphs, normalised so that pure re-indentation
 * does not read as a change. A pass that only reformats has changed nothing
 * the annotation cares about, and showing that as a wall of red would bury the
 * one line that did change.
 */
export function graphDiff(before, after) {
  const norm = (g) => {
    const parsed = parsePenman(g || '');
    const text = parsed ? toPenman(parsed) : (g || '');
    return text.split('\n').map((l) => l.trim()).filter(Boolean);
  };
  const a = norm(before);
  const b = norm(after);
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    removed: a.filter((l) => !setB.has(l)),
    added: b.filter((l) => !setA.has(l)),
    same: a.filter((l) => setB.has(l)).length,
  };
}
