/**
 * Shared runner for *flat* formats (sentiment, and anything produced by the
 * format studio): independent skills, no recursion, each click is one model
 * call that merges its output fields into `sentence.annotation`. UMR's
 * recursive pipeline lives in core/pipeline.js; this is the simpler sibling
 * for formats that do not need it.
 */

import { runSkillCall } from './runner.js';
import { loadEffectiveText as loadSkillText } from './skills.js';

export async function runFlatSkill(skillDef, sentence, language) {
  const skillText = skillDef.file ? await loadSkillText(skillDef.file) : '';
  const input = `## Task input\nSentence: ${sentence.text}\n\n`
    + `Produce the "${skillDef.id}" field(s) described above; answer with the JSON only.`;
  const prompt = [skillText, input].filter(Boolean).join('\n\n---\n\n');
  const res = await runSkillCall({ skillId: skillDef.id, span: sentence.text, prompt, language });
  sentence.annotation = { ...(sentence.annotation || {}), ...(res.output && typeof res.output === 'object' ? res.output : {}) };
  return {
    skill: skillDef.id, span: sentence.text, input, output: res.output, rationale: res.rationale,
    source: res.source, model: res.model, latencyMs: res.latencyMs, children: [],
  };
}

/** Pending markers for skills that haven't produced a resolved node yet. */
export function flatPendingSlots(skills, sentence) {
  const done = new Set((sentence.tree || []).filter((n) => !n.pending).map((n) => n.skill));
  return skills.filter((s) => !done.has(s.id))
    .map((s) => ({ pending: true, kind: s.id, phrase: sentence.text, depth: 0 }));
}
