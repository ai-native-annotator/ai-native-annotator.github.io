/**
 * Reflection on one step: what in the skill made this node's output wrong, and the edit that
 * fixes it. Three ways in, one way out:
 *
 *   mode "corrected"  a person replaced the node's output; the difference is the evidence
 *   mode "told"       a person says in words what is wrong
 *   mode "self"       no feedback: the model reviews the step on its own
 *
 * The answer is {diagnosis, layer, edits:[{file, op, find, replace, why}]}, edits in the
 * modify / add / delete form SkillParseUMR's RSI uses (`find` must occur exactly once).
 * Nothing is applied until a person applies it; applying makes a new version of the file
 * (store.js) and the next run of the node uses it.
 */

import { llm } from './models.js';
import { py } from './py.js';
import { addVersion } from './store.js';
import { stable } from './diff.js';

const MAX_FILE = 60000;
const MAX_FIELD = 12000;

function clip(text, n = MAX_FIELD) {
  const s = typeof text === 'string' ? text : stable(text);
  return s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s;
}

const SYSTEM = `You maintain the skills of an annotation pipeline for Uniform Meaning Representation (UMR).
A person is checking the pipeline one step at a time. You get one step (a node): the skill that ran,
its input, what it produced, the person's feedback, and the skill's source files. Find what in the
skill caused the problem and propose the smallest general edit that fixes it.

How the skills work (SkillParseUMR decision orchestration):
- The procedure is a registry (src/runner.py): a tree of skill calls per sentence.
- sent_type is kind "jev": a Python file whose run(**inputs) is a generator. Its rules list the
  possible answers locally, it yields closed questions (choice / noul = yes-no / score; texts and
  option lists in its prompts.yaml), Jev answers them with probabilities, and rules build its output
  ("emit") from the answers.
- Every other model skill is kind "agent": its skill.md is the prompt (the part before "## Input" is
  the instructions, the rest this call's input) sent to Haiku, which may call tools (get_example reads
  reference/example.md; propbank_lookup) and returns the emit as JSON. Its problems are "instructions"
  (the skill.md, or an example in reference/example.md). A jev skill's wrong output has one of
  these causes: "question" (the right option was offered but the wording or option descriptions led
  to a wrong pick), "candidates" (the right answer was not among the options, or a needed question
  was never asked), "rule" (the answers were right, the code assembled them wrongly).
- A skill of kind "rule" is plain Python run(**inputs) -> emit.
- "upstream": the step did right with what it got; an earlier step gave it a wrong input.
- "not-a-skill-problem": the output is fine, or the feedback asks for something no edit should do.

Rules for edits:
- Edit only the files you were given. Each edit: file (path exactly as given), op "modify" (replace
  find with replace), "add" (insert replace right after find; an empty find appends to the end) or
  "delete" (remove find). find must be copied exactly from the file and occur exactly once.
- Keep Python valid and keep the skill's output contract (its emit fields and types).
- Fix the mechanism, not this sentence: no special case for this sentence's content words. Closed
  classes (function words, markers, punctuation) may be listed.
- Prefer one or two small edits. If the cause is upstream or not in the skill, say so and return no edits.
Answer with the final_result tool.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string', description: 'what went wrong and why, in the language the person wrote in (Chinese if unsure)' },
    layer: { type: 'string', enum: ['question', 'candidates', 'rule', 'instructions', 'upstream', 'not-a-skill-problem'] },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' }, op: { type: 'string', enum: ['modify', 'add', 'delete'] },
          find: { type: 'string' }, replace: { type: 'string' }, why: { type: 'string' },
        },
        required: ['file', 'op', 'find', 'why'],
      },
    },
  },
  required: ['diagnosis', 'layer', 'edits'],
};

function jevRounds(rounds) {
  const out = [];
  (rounds || []).forEach((r, k) => {
    out.push(`### Round ${k + 1}`);
    out.push(`state: ${clip(r.state, 3000)}`);
    const qs = Object.entries(r.questions || {});
    qs.slice(0, 80).forEach(([id, q]) => {
      const a = r.answers?.[id];
      let got = '(not answered)';
      if (a && 'noul' in a) got = `yes ${Number(a.noul).toFixed(2)}${a.by ? ` (${a.by})` : ''}`;
      else if (a?.probabilities) {
        got = Object.entries(a.probabilities).sort((p, s) => s[1] - p[1]).slice(0, 3)
          .map(([o, p]) => `${o} ${Number(p).toFixed(2)}`).join(', ') + (a.by ? ` (${a.by})` : '');
      } else if (a) got = JSON.stringify(a);
      const ins = typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions);
      const opts = q.type === 'choice' ? ` options: ${Object.keys(q.criteria || {}).join(' | ')}` : '';
      out.push(`- [${id}] (${q.type}) ${clip(ins, 400)}${opts} -> ${got}`);
    });
    if (qs.length > 80) out.push(`… ${qs.length - 80} more questions`);
  });
  return out.join('\n');
}

/** The prompt for one node. `files` is {path: text}. */
export function buildPrompt({ skillset, node, context, mode, feedback, corrected, files, graph }) {
  const parts = [`# Procedure\n${skillset} (a registry: a tree of skill calls per sentence)`];
  parts.push(`# The step\nnode ${node.id}, skill \`${node.skill}\`, kind ${node.kind}${node.edge ? `, edge ${node.edge}` : ''}`);
  parts.push(`## Context (the same for every step of this sentence)\n${clip(context, 4000)}`);
  parts.push(`## Input\n${clip(node.input)}`);
  if (node.rounds?.length) parts.push(`## Closed questions and answers\n${jevRounds(node.rounds)}`);
  if (node.prompt) parts.push(`## The prompt's input part (the instructions are the skill.md below)\n${clip(node.prompt.input, 6000)}`);
  if (node.tool_calls?.length) parts.push(`## Tool calls\n${node.tool_calls.map((c) => `${c.tool}(${JSON.stringify(c.args)}) -> ${clip(c.result, 500)}`).join('\n')}`);
  if (node.dropped?.length) parts.push(`## Children not made\n${clip(node.dropped, 2000)}`);
  const machine = node.machine_output ?? node.output;
  parts.push(`## What the skill produced\n${clip(machine)}`);
  if (node.error) parts.push(`## Error\n${node.error}\n${clip(node.trace || '', 3000)}`);
  if (graph) parts.push(`## The sentence's assembled graph (for orientation)\n${clip(graph, 5000)}`);
  if (mode === 'corrected') {
    parts.push(`# Feedback: the person corrected the output to\n${clip(corrected)}`);
    if (feedback) parts.push(`They also say: ${feedback}`);
    parts.push('Find why the skill did not produce the corrected output, and the edit that makes it do so (and would on similar sentences).');
  } else if (mode === 'told') {
    parts.push(`# Feedback: the person says\n${feedback}`);
  } else {
    parts.push('# No feedback: review this step yourself. If it is right, say so (layer not-a-skill-problem, no edits).');
  }
  parts.push('# Files you may edit');
  for (const [path, text] of Object.entries(files)) {
    parts.push(`## ${path}\n\`\`\`\n${text.length > MAX_FILE ? `${text.slice(0, MAX_FILE)}\n… (cut)` : text}\n\`\`\``);
  }
  return parts.join('\n\n');
}

export async function reflect(args) {
  return llm({ role: 'reflect', system: SYSTEM, instructions: buildPrompt(args), schema: SCHEMA, maxTurns: 2, signal: args.signal });
}

/** Apply the edits to one file's text. Returns {text, results:[{ok, why}]}; failed edits change nothing. */
export function applyEdits(text, edits) {
  let out = text;
  const results = edits.map((e) => {
    const find = e.find ?? '';
    if (e.op === 'add' && !find) {
      out = `${out.replace(/\n*$/, '\n')}${e.replace || ''}\n`;
      return { ok: true };
    }
    const count = find ? out.split(find).length - 1 : 0;
    if (count !== 1) return { ok: false, why: count === 0 ? 'find text not in the file' : `find text occurs ${count} times` };
    if (e.op === 'modify') out = out.replace(find, () => e.replace ?? '');
    else if (e.op === 'add') out = out.replace(find, () => find + (e.replace ?? ''));
    else if (e.op === 'delete') out = out.replace(find, () => '');
    else return { ok: false, why: `unknown op ${e.op}` };
    return { ok: true };
  });
  return { text: out, results };
}

/** Apply chosen edits, file by file, through the bridge (which compiles Python and reloads). */
export async function applyToFiles(sid, edits, note) {
  const byFile = new Map();
  edits.forEach((e, k) => {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push({ ...e, k });
  });
  const report = [];
  for (const [file, list] of byFile) {
    let before;
    try {
      before = await py('read_file', { path: file });
    } catch (err) {
      list.forEach((e) => report.push({ k: e.k, ok: false, why: err.message }));
      continue;
    }
    const { text, results } = applyEdits(before, list);
    results.forEach((r, n) => report.push({ k: list[n].k, ...r }));
    if (text === before) continue;
    const res = await py('write_file', { path: file, content: text });
    if (!res.ok) {
      await py('write_file', { path: file, content: before });
      list.forEach((e, n) => { if (results[n].ok) report.find((r) => r.k === e.k).ok = false; });
      list.forEach((e) => { const r = report.find((x) => x.k === e.k); r.why = `reverted: ${res.problem}`; });
      continue;
    }
    addVersion(sid, file, text, note, 'reflection');
  }
  return report.sort((a, b) => a.k - b.k);
}
