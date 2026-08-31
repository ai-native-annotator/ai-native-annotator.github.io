/**
 * The UMR skill pipeline, ported to the browser from modular-parsing's
 * umr_parser/pipeline.py + umr_parser/modules/*.py, so annotation in this
 * tool is driven by the real skill definitions (data/skills/.../*.md,
 * vendored verbatim) and the real control flow, one click at a time.
 *
 * Design: the annotation tree is a tree of resolved nodes
 * {skill, span, input, output, rationale, children:[...]} interleaved with
 * *pending* leaves {pending:true, kind, phrase, role, depth} that the user
 * can click to resolve. Resolving a pending leaf runs the matching skill
 * call(s) and immediately scans the result for further pending leaves
 * (relations whose value is `{expand:true, ...}`) — that scan is the one
 * mechanism that both (a) grows the tree forward for a brand-new document
 * and (b) repairs old recorded documents whose export step dropped
 * children (see normalizeTree): either way, an unresolved pending leaf is
 * always visible, never silently missing.
 */

import { runSkillCall } from './runner.js';
import { logInfo, logWarn } from './log.js';
import { loadEffectiveText } from './skills.js';
import { t } from './i18n.js';
import { fetchAsset } from './net.js';

// Depth at which clause recursion stops and phrases are forced atomic/np —
// mirrors umr_parser/pipeline.py's MAX_DEPTH / FORCE_ATOMIC_DEPTH exactly.
const MAX_DEPTH = 6;
const FORCE_ATOMIC_DEPTH = 8;

// Which markdown files each skill's prompt is assembled from. Display names
// are NOT here: the UI reads them from the format module (formats/umr.js),
// which builds them through t('skill.<id>') so they follow the language.
export const SKILL_META = {
  discourse: { file: 'shared/discourse.md', notes: 'shared/discourse.md', schema: true },
  predicate: { file: 'shared/predicate.md', notes: '', schema: false },
  arguments: { file: 'shared/arguments.md', notes: 'shared/arguments.md', schema: true },
  np_phrase: { file: 'shared/np_phrase.md', notes: 'shared/np_phrase.md', schema: true },
  special_entity: { file: 'shared/special_entity.md', notes: 'shared/special_entity.md', schema: true },
  stop_test: { file: 'shared/stop_test.md', notes: '', schema: false },
  reentrancy: { file: 'shared/reentrancy.md', notes: '', schema: false },
  doc_level: { file: 'shared/doc_level.md', notes: 'shared/doc_level.md', schema: false },
};

/* --------------------------------------------------------- vendored data */

const DATA_BASE = 'data';
let abstractRolesets = null;

/**
 * Skill text goes through core/skills.js so that an amendment accepted in the
 * chat pane is actually present in the very next prompt — that is what makes
 * the feedback loop a loop rather than a suggestion box.
 */
const fetchText = loadEffectiveText;

async function loadAbstractRolesets() {
  if (abstractRolesets) return abstractRolesets;
  const res = await fetchAsset(`${DATA_BASE}/resources/abstract_rolesets.json`);
  abstractRolesets = res.ok ? await res.json() : {};
  return abstractRolesets;
}

/** Assemble the full prompt for one skill call: skill file + language overlay + node schema + task input. */
async function buildPrompt(skillId, language, taskInput) {
  const meta = SKILL_META[skillId];
  const parts = [await fetchText(`skills/${meta.file}`)];
  parts.push(await fetchText(`skills/${language}/overlay.md`));
  if (meta.schema) parts.push(await fetchText('skills/shared/_node_schema.md'));
  if (meta.notes) {
    // notes files are mined-example addenda in the research repo; not vendored
    // here (they are large and ablation-only) — the shared skill file plus
    // language overlay already carries the operative rules.
  }
  parts.push(taskInput);
  return parts.filter((p) => p && p.trim()).join('\n\n---\n\n');
}

/* ------------------------------------------------------------ task input */
// These mirror each Python module's `run()` task-string construction
// exactly (umr_parser/modules/*.py) so the live prompt matches the backend.

const langName = (language) => (language === 'zh' ? 'Chinese' : 'English');

function taskDiscourse(sentence, language) {
  return `## Task input\nSentence (${langName(language)}):\n${sentence}\n\n`
    + 'Decide the discourse structure and answer with the JSON only.';
}

async function taskPredicate(clause, sentence) {
  const ar = await loadAbstractRolesets();
  const abstract = Object.keys(ar).sort().join(', ');
  return `## Available abstract rolesets\n${abstract}\n\n## Task input\n`
    + `Full sentence (context): ${sentence}\nClause to analyse: ${clause}\n\n`
    + 'Identify the core predicate; answer with the JSON only.';
}

async function framesReference(predicateInfo) {
  if (predicateInfo?.predicate_kind === 'abstract' && predicateInfo?.concept) {
    const ar = await loadAbstractRolesets();
    const entry = ar[predicateInfo.concept];
    if (entry) {
      const roles = Object.entries(entry.roles || {}).map(([k, v]) => `${k}: ${v}`).join('  ');
      return `${predicateInfo.concept} (${entry.description})  ${roles}`;
    }
    return `${predicateInfo.concept} (abstract roleset; use ARG1/ARG2 as in the examples)`;
  }
  const lemmas = (predicateInfo?.lemmas || []).filter(Boolean);
  if (!lemmas.length) return '(no PropBank frame database vendored in this browser build — propose the most standard sense id you know, or <lemma>-01 if unsure)';
  return `(no local PropBank frame database — candidate lemmas: ${lemmas.join(', ')}; `
    + 'use the standard numbered sense you know for each, or <lemma>-01 if unsure)';
}

async function taskArguments(clause, sentence, predicateInfo) {
  const frames = await framesReference(predicateInfo || {});
  return `## PropBank / roleset reference for this predicate\n${frames}\n\n## Task input\n`
    + `Full sentence (context): ${sentence}\nClause to analyse: ${clause}\n`
    + `Core predicate: ${predicateInfo?.predicate_text || '?'} (kind: ${predicateInfo?.predicate_kind})\n\n`
    + 'Build the event node; answer with the JSON node only.';
}

// Curated, non-exhaustive NER head-concept inventory (the source repo's list
// comes from an .xlsx resource this browser build does not vendor). Covers
// the categories the np_phrase skill file itself calls out.
const NER_TYPES = [
  'person', 'family', 'animal', 'language', 'nationality', 'ethnic-group', 'religious-group',
  'political-party', 'political-movement', 'organization', 'company', 'government-organization',
  'military', 'criminal-organization', 'sports-league', 'sports-team', 'sports-facility',
  'university', 'school', 'research-institute', 'newspaper', 'magazine', 'publisher',
  'broadcast-program', 'tv-show', 'tv-channel', 'radio-station', 'publication', 'book', 'movie',
  'music', 'show', 'treaty', 'law', 'court-decision', 'product', 'vehicle', 'ship', 'spaceship',
  'aircraft-type', 'car-make', 'natural-object', 'award', 'country', 'city', 'state', 'province',
  'county', 'continent', 'local-region', 'world-region', 'water', 'mountain', 'volcano', 'valley',
  'island', 'peninsula', 'strait', 'ocean', 'sea', 'lake', 'river', 'gulf', 'bay', 'park', 'palace',
  'hotel', 'worship-place', 'market', 'station', 'airport', 'port', 'tunnel', 'canal', 'bridge',
  'road', 'railway-line', 'moon', 'planet', 'star', 'constellation', 'facility', 'city-district',
  'event', 'incident', 'natural-disaster', 'war', 'conference', 'game', 'festival', 'disease',
];

function taskNpPhrase(phrase, sentence) {
  return `## Named-entity type inventory (head concepts for named entities)\n${NER_TYPES.join(', ')}\n\n`
    + `## Task input\nFull sentence (context): ${sentence}\nNoun phrase to analyse: ${phrase}\n\n`
    + 'Build the subtree; answer with the JSON node only.';
}

function taskSpecialEntity(phrase, sentence) {
  return `## Task input\nFull sentence (context): ${sentence}\nSpecial phrase to analyse: ${phrase}\n\n`
    + 'Build the subtree; answer with the JSON node only.';
}

function taskStopTest(phrase) {
  return `## Task input\nPhrase: ${phrase}\n\nClassify it; answer with the JSON only.`;
}

function taskReentrancy(sentence, listing) {
  return `## Task input\nSentence: ${sentence}\n\nNodes in the parsed graph:\n${listing}\n\n`
    + 'List coreferent pairs; answer with the JSON only.';
}

/* -------------------------------------------------------- code-only rules */
// Ported from umr_parser/modules/phrase.py quick_stop_test — a cheap
// programmatic pre-check consulted before the stop_test skill (which itself
// is only ever reached when an upstream skill fails to specify a valid
// kind — see resolvePendingLeaf below).

const PRONOUNS_EN = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
  'her', 'us', 'them', 'his', 'its', 'their', 'my', 'your', 'our', 'this', 'that', 'these', 'those']);
const PRONOUNS_ZH = new Set(['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们',
  '它们', '这', '那', '这些', '那些', '自己', '其', '该']);
const SPECIAL_RX = /\d[\d,.:/年月日时点分%]*|https?:\/\/|www\.|[０-９]+/i;

export function quickStopTest(phrase, language) {
  const p = String(phrase || '').trim();
  if (language === 'en') {
    const tokens = p.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      const w = tokens[0].replace(/^["'.,!?]+|["'.,!?]+$/g, '').toLowerCase();
      if (PRONOUNS_EN.has(w)) return 'np';
      if (SPECIAL_RX.test(w)) return 'special';
      return 'atomic';
    }
  } else {
    if (PRONOUNS_ZH.has(p)) return 'np';
    if (p.length <= 3 && !SPECIAL_RX.test(p)) return 'atomic';
  }
  if (new RegExp(`^(?:${SPECIAL_RX.source})$`, 'i').test(p)) return 'special';
  return null;
}

function truncateForLog(s, n = 30) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function atomicConcept(phrase, language) {
  let concept = phrase.trim().replace(/^[.,!?;"'，。！？；、]+|[.,!?;"'，。！？；、]+$/g, '');
  if (language === 'en') concept = concept.toLowerCase().replace(/\s+/g, '-');
  else concept = concept.replace(/\s+/g, '');
  return concept || 'thing';
}

/* --------------------------------------------------------- tree plumbing */

function makePendingMarker({ kind, phrase, role, depth, sub }) {
  return { pending: true, kind: kind || 'np', phrase: String(phrase || '').trim(),
    role: role || null, depth: depth || 0, sub: sub || null };
}

/** Pull [role, value] pairs into pending markers wherever value is an unresolved leaf. */
function pendingFromPairs(pairs, depth) {
  const out = [];
  for (const pair of pairs || []) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [role, value] = pair;
    if (value && typeof value === 'object' && value.expand === true) {
      out.push(makePendingMarker({ kind: value.kind, phrase: value.phrase, role, depth, sub: value.sub }));
    }
  }
  return out;
}

function scanPendingChildren(nodeOutput, depth) {
  const rels = Array.isArray(nodeOutput?.relations) ? nodeOutput.relations : [];
  return pendingFromPairs(rels, depth);
}

function resultNode(skillId, span, taskInputText, res, children = []) {
  return {
    skill: skillId, span, input: taskInputText, output: res.output,
    rationale: res.rationale, source: res.source, model: res.model || '',
    latencyMs: res.latencyMs || 0, children,
  };
}

/** Resolve one pending leaf (kind already decided) into a node, recursing children. */
async function resolveByKind(kind, marker, ctx) {
  const { sentence, language } = ctx;
  const phrase = marker.phrase;
  const depth = marker.depth;

  if (kind === 'atomic') {
    const concept = atomicConcept(phrase, language);
    return resultNode('(stop)', phrase, phrase, {
      output: { concept, kind: 'atomic' },
      rationale: t('pipe.atomicRationale'),
      source: 'rule',
    });
  }

  if (kind === 'special') {
    const input = taskSpecialEntity(phrase, sentence.text);
    const prompt = await buildPrompt('special_entity', language, input);
    const res = await runSkillCall({ skillId: 'special_entity', span: phrase, prompt, language });
    if (!res.output?.concept) {
      logWarn('pipeline', t('pipe.specialFallback', { phrase: truncateForLog(phrase) }));
      res.output = { concept: 'string-entity', relations: [[':value', `"${phrase}"`]], phrase };
    }
    return resultNode('special_entity', phrase, input, res, scanPendingChildren(res.output, depth + 1));
  }

  if (kind === 'np') {
    const input = taskNpPhrase(phrase, sentence.text);
    const prompt = await buildPrompt('np_phrase', language, input);
    const res = await runSkillCall({ skillId: 'np_phrase', span: phrase, prompt, language });
    if (!res.output?.concept) {
      logWarn('pipeline', t('pipe.npFallback', { phrase: truncateForLog(phrase) }));
      res.output = { concept: phrase.replace(/\s+/g, '-').toLowerCase() || 'thing', relations: [], phrase };
    }
    return resultNode('np_phrase', phrase, input, res, scanPendingChildren(res.output, depth + 1));
  }

  // clause: predicate -> arguments, predicate call shown as the first (non-expandable) child
  const predInput = await taskPredicate(phrase, sentence.text);
  const predPrompt = await buildPrompt('predicate', language, predInput);
  const predRes = await runSkillCall({ skillId: 'predicate', span: phrase, prompt: predPrompt, language });
  if (!predRes.output || typeof predRes.output !== 'object') predRes.output = {};
  predRes.output.predicate_kind ??= 'verb';
  predRes.output.lemmas ??= [];

  const argInput = await taskArguments(phrase, sentence.text, predRes.output);
  const argPrompt = await buildPrompt('arguments', language, argInput);
  const argRes = await runSkillCall({ skillId: 'arguments', span: phrase, prompt: argPrompt, language });
  if (!argRes.output?.concept) {
    const lemma = (predRes.output.lemmas || [])[0] || phrase.split(/\s+/)[0] || 'event';
    argRes.output = { concept: `${lemma}-01`, relations: [], phrase };
    logWarn('pipeline', t('pipe.argFallback', { concept: argRes.output.concept }));
  }
  const node = resultNode('arguments', phrase, argInput, argRes, scanPendingChildren(argRes.output, depth + 1));
  node.children.unshift(resultNode('predicate', phrase, predInput, predRes));
  return node;
}

/**
 * Resolve one pending leaf, including the rare stop_test fallback (an
 * upstream skill omitted or mis-specified `kind`) and depth-forced
 * downgrades — both made visible in the node's rationale rather than
 * applied silently.
 */
export async function resolvePendingLeaf(marker, ctx) {
  const { language } = ctx;
  let kind = marker.kind;
  let forcedNote = '';
  if (marker.depth >= FORCE_ATOMIC_DEPTH && kind !== 'atomic') {
    forcedNote = t('pipe.forcedAtomic', { depth: marker.depth, max: FORCE_ATOMIC_DEPTH });
    kind = 'atomic';
  } else if (marker.depth >= MAX_DEPTH && kind === 'clause') {
    forcedNote = t('pipe.forcedNp', { depth: marker.depth, max: MAX_DEPTH });
    kind = 'np';
  }

  let node;
  if (!['clause', 'np', 'special', 'atomic'].includes(kind)) {
    // fallback path — mirrors pipeline.py's `if kind not in (...): kind = stop_test.run(...)`
    const quick = quickStopTest(marker.phrase, language);
    if (quick) {
      node = await resolveByKind(quick, { ...marker, kind: quick }, ctx);
      node.rationale = `${node.rationale || ''}\n（kind 由代码规则 quick_stop_test 判定为 ${quick}）`.trim();
    } else {
      const input = taskStopTest(marker.phrase);
      const prompt = await buildPrompt('stop_test', language, input);
      const stopRes = await runSkillCall({ skillId: 'stop_test', span: marker.phrase, prompt, language });
      const decided = ['atomic', 'np', 'clause', 'special'].includes(stopRes.output?.kind) ? stopRes.output.kind : 'np';
      node = await resolveByKind(decided, { ...marker, kind: decided }, ctx);
      node.children.unshift(resultNode('stop_test', marker.phrase, input, stopRes));
    }
  } else {
    node = await resolveByKind(kind, marker, ctx);
  }

  if (marker.sub?.length) {
    node.output.relations = [...(node.output.relations || []), ...marker.sub];
    node.children.push(...pendingFromPairs(marker.sub, marker.depth + 1));
  }
  if (forcedNote) node.rationale = `${node.rationale || ''}\n${forcedNote}`.trim();
  node.role = marker.role || null;
  return node;
}

/* --------------------------------------------------------------- discourse */

export async function resolveDiscourse(ctx) {
  const { sentence, language } = ctx;
  const input = taskDiscourse(sentence.text, language);
  const prompt = await buildPrompt('discourse', language, input);
  const res = await runSkillCall({ skillId: 'discourse', span: sentence.text, prompt, language });
  const out = (res.output && typeof res.output === 'object' && 'has_discourse' in res.output)
    ? res.output : { has_discourse: false };
  res.output = out;

  const node = resultNode('discourse', sentence.text, input, res, []);
  if (out.has_discourse && out.structure && typeof out.structure === 'object') {
    const structure = out.structure;
    if (structure.expand === true) {
      // subordination: structure itself is the pending main clause (depth 0), sub = extra roles
      node.children = [makePendingMarker({
        kind: structure.kind, phrase: structure.phrase, depth: 0, sub: structure.sub,
      })];
    } else {
      // coordination: structure is a resolved concept node whose relations are pending clauses
      node.children = scanPendingChildren(structure, 1);
    }
  }
  return { discourseNode: node, needsFallbackClause: !out.has_discourse };
}

/* -------------------------------------------------------------- reentrancy */

const GRAPH_SKILLS = new Set(['arguments', 'np_phrase', 'special_entity', '(stop)']);

/** Walk resolved graph-content nodes anywhere in the tree (skip predicate/stop_test/discourse wrappers, but recurse through them). */
function collectContentNodes(sentence) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.pending) continue;
      if (GRAPH_SKILLS.has(n.skill)) out.push(n);
      walk(n.children);
    }
  };
  walk(sentence.tree);
  return out;
}

function assignIds(sentence) {
  const nodes = collectContentNodes(sentence);
  sentence._idSeq = sentence._idSeq || 0;
  for (const n of nodes) {
    n.output.id = n.output.id || `e${++sentence._idSeq}`;
  }
  return nodes;
}

/** Find `target` anywhere in the real tree and replace it in place with a reference marker. */
function replaceWithRef(nodes, target, canonId) {
  for (let i = 0; i < (nodes || []).length; i++) {
    if (nodes[i] === target) {
      nodes[i] = { ref: canonId, role: target.role || null, skill: '(ref)', span: target.span, pending: false, children: [] };
      return true;
    }
    if (!nodes[i].pending && replaceWithRef(nodes[i].children, target, canonId)) return true;
  }
  return false;
}

export async function resolveReentrancy(ctx) {
  const { sentence, language } = ctx;
  const nodes = assignIds(sentence);
  if (nodes.length < 3) {
    return resultNode('reentrancy', sentence.text, t('pipe.reentSkipInput'), {
      output: { merge: [] }, rationale: t('pipe.reentSkip'), source: 'rule',
    });
  }
  const listing = nodes.map((n) => `- ${n.output.id}: ${n.output.concept} | "${n.output.phrase || ''}"`).join('\n');
  const input = taskReentrancy(sentence.text, listing);
  const prompt = await buildPrompt('reentrancy', language, input);
  const res = await runSkillCall({ skillId: 'reentrancy', span: sentence.text, prompt, language });
  const merges = Array.isArray(res.output?.merge) ? res.output.merge : [];

  const byId = new Map(nodes.map((n) => [String(n.output.id), n]));
  let applied = 0;
  for (const pair of merges) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [canon, dup] = pair.map(String);
    if (canon === dup || !byId.has(canon) || !byId.has(dup)) continue;
    replaceWithRef(sentence.tree, byId.get(dup), canon);
    applied++;
  }
  const attrNote = applyDefaultAttributes(nodes);
  const node = resultNode('reentrancy', sentence.text, input, res);
  node.rationale = [res.rationale, applied ? t('pipe.reentMerged', { n: applied }) : '', attrNote]
    .filter(Boolean).join(' ');
  return node;
}

/** Guarantee :aspect / :modstr on every event node — mirrors pipeline.py's _default_attributes. */
function applyDefaultAttributes(nodes) {
  let n = 0;
  for (const node of nodes) {
    const concept = String(node.output.concept || '');
    if (!/-\d+$/.test(concept)) continue;
    const roles = (node.output.relations || []).map((r) => r[0]);
    node.output.relations = node.output.relations || [];
    if (!roles.includes(':aspect')) {
      node.output.relations.push([':aspect', /-9\d$/.test(concept) ? 'state' : 'performance']);
      n++;
    }
    if (!roles.includes(':modstr')) { node.output.relations.push([':modstr', 'fullaff']); n++; }
  }
  return n ? t('pipe.defaultAttrs', { n }) : '';
}

/* -------------------------------------------------------------- doc_level */

const MODSTR_TO_DEP = {
  fullaff: ':full-affirmative', partaff: ':partial-affirmative', neutaff: ':neutral-affirmative',
  fullneg: ':full-negative', partneg: ':partial-negative', neutneg: ':neutral-negative',
};
const OVERLAP_ASPECTS = new Set(['state', 'habitual', 'activity', 'process', 'imperfective', 'atelic-process', 'generic']);

function buildCurrentEntries(sentence, sentenceIndex) {
  const nodes = collectContentNodes(sentence);
  return nodes.map((n) => {
    const concept = String(n.output.concept || '');
    const rel = Object.fromEntries((n.output.relations || []).filter((r) => typeof r[1] !== 'object'));
    return {
      var: n.output.id, concept, snt: sentenceIndex,
      is_event: /-\d+$/.test(concept),
      aspect: rel[':aspect'] || null, modstr: rel[':modstr'] || null,
      depth: 1, // best-effort: exact clause-recursion depth isn't preserved per-node; treated uniformly
    };
  });
}

function mainEvents(current) {
  const discourseConcepts = new Set(['and-91', 'but-91', 'contrast-91', 'and', 'or',
    'unexpected-co-occurrence-91', 'multi-sentence']);
  return current.filter((e) => e.is_event && !discourseConcepts.has(e.concept));
}

function defaultTemporal(current) {
  return mainEvents(current).slice(0, 4).map((e) => (
    [ 'document-creation-time', OVERLAP_ASPECTS.has(e.aspect) ? ':overlap' : ':after', e.var ]
  ));
}

function renderDocAnnotation(sntIndex, temporal, modal, coref) {
  const block = (triples) => triples
    .filter((tp) => Array.isArray(tp) && tp.length === 3)
    .map((tp) => `(${tp[0]} ${String(tp[1]).startsWith(':') ? tp[1] : ':' + tp[1]} ${tp[2]})`);
  const parts = [`(s${sntIndex}s0 / sentence`];
  for (const [role, triples] of [[':temporal', temporal], [':modal', modal], [':coref', coref]]) {
    const rows = block(triples);
    if (rows.length) parts.push(`\t${role} (${rows.join('\n\t\t')})`);
  }
  return parts.join('\n') + ')';
}

export async function resolveDocLevel(ctx) {
  const { doc, sentence, sentenceIndex, language } = ctx;
  const current = buildCurrentEntries(sentence, sentenceIndex);
  const registry = [];
  for (let i = 0; i < sentenceIndex; i++) {
    const s = doc.sentences[i];
    if (s?._docRegistry) registry.push(...s._docRegistry);
  }
  sentence._docRegistry = current;

  const defaultModal = [['root', ':modal', 'author']];
  for (const e of mainEvents(current)) {
    defaultModal.push(['author', MODSTR_TO_DEP[e.modstr || 'fullaff'] || ':full-affirmative', e.var]);
  }
  const curTxt = current.map((e) => `- ${e.var}: ${e.concept}`
    + (e.is_event ? ` (aspect=${e.aspect}, modstr=${e.modstr})` : '')).join('\n') || '(none)';
  const regTail = registry.slice(-120);
  const regTxt = regTail.length
    ? regTail.map((e) => `- snt${e.snt}: ${e.var}: ${e.concept}`).join('\n')
    : "(none — this is the first sentence)";

  const input = `## Task input\nCurrent sentence (snt${sentenceIndex}): ${sentence.text}\n\n`
    + `Current sentence variables:\n${curTxt}\n\n`
    + `Registry of previous sentences' variables:\n${regTxt}\n\n`
    + `Default modal triples (adjust if needed): ${JSON.stringify(defaultModal)}\n\n`
    + 'Produce temporal/modal/coref; answer with the JSON only.';
  const prompt = await buildPrompt('doc_level', language, input);
  const res = await runSkillCall({ skillId: 'doc_level', span: sentence.text, prompt, language });

  const modal = defaultModal;
  const knownVars = new Set([...current.map((e) => e.var), ...registry.map((e) => e.var),
    'document-creation-time', 'root', 'author', 'past-reference', 'present-reference', 'future-reference']);
  const temporal = defaultTemporal(current);
  const anchored = new Set(temporal.map((tp) => tp[2]));
  const extraTemporal = (Array.isArray(res.output?.temporal) ? res.output.temporal : [])
    .filter((tp) => Array.isArray(tp) && tp.length === 3 && knownVars.has(String(tp[0])) && knownVars.has(String(tp[2]))
      && String(tp[0]) !== 'document-creation-time' && !anchored.has(String(tp[2])))
    .slice(0, 2);
  const coref = (Array.isArray(res.output?.coref) ? res.output.coref : [])
    .filter((tp) => Array.isArray(tp) && tp.length === 3 && knownVars.has(String(tp[0])) && knownVars.has(String(tp[2])))
    .slice(0, 4);

  const docAnnotation = renderDocAnnotation(sentenceIndex, [...temporal, ...extraTemporal], modal, coref);
  sentence.docAnnotation = docAnnotation;
  const node = resultNode('doc_level', sentence.text, input, res);
  node.output = { temporal: [...temporal, ...extraTemporal], modal, coref, rendered: docAnnotation };
  return node;
}

/* ----------------------------------------------------- top-level advance */

function isFullyResolved(nodes) {
  for (const n of nodes || []) {
    if (n.pending) return false;
    if (!isFullyResolved(n.children)) return false;
  }
  return true;
}

/**
 * Decide what top-level pending slot (if any) should exist next, and append
 * it. Called after every resolution and once on document load. Idempotent.
 */
export function advanceSentence(sentence) {
  if (!sentence.tree.length) {
    sentence.tree.push(makePendingMarker({ kind: 'discourse', phrase: sentence.text, depth: 0 }));
    return;
  }
  const disc = sentence.tree.find((n) => n.skill === 'discourse');
  if (!disc || disc.pending) return; // discourse not resolved yet — nothing else to queue

  const hasFallback = sentence.tree.some((n) => n.pending ? n.kind !== 'reentrancy' && n.kind !== 'doc_level'
    : GRAPH_SKILLS.has(n.skill));
  if (disc.output?.has_discourse === false && !hasFallback) {
    sentence.tree.splice(1, 0, makePendingMarker({ kind: 'clause', phrase: sentence.text, depth: 0 }));
    return;
  }

  if (!isFullyResolved(sentence.tree.filter((n) => n.pending ? true : (n.skill !== 'reentrancy' && n.skill !== 'doc_level')))) {
    return; // still clause content left to expand
  }

  const hasReentrancy = sentence.tree.some((n) => n.skill === 'reentrancy' || n.kind === 'reentrancy');
  if (!hasReentrancy) { sentence.tree.push(makePendingMarker({ kind: 'reentrancy', phrase: sentence.text })); return; }
  const reentrancyDone = sentence.tree.some((n) => n.skill === 'reentrancy' && !n.pending);
  if (!reentrancyDone) return;

  const hasDocLevel = sentence.tree.some((n) => n.skill === 'doc_level' || n.kind === 'doc_level');
  if (!hasDocLevel) { sentence.tree.push(makePendingMarker({ kind: 'doc_level', phrase: sentence.text })); return; }
}

export function sentenceDone(sentence) {
  return sentence.tree.some((n) => n.skill === 'doc_level' && !n.pending);
}

/* ------------------------------------------------------- graph rebuilding */
// Converts the interactive tree (pending markers + resolved call nodes) back
// into the {concept, relations, id} shape core/penman.js knows how to render,
// so the artifact pane always reflects exactly what has been resolved so far
// — partial trees included (unresolved slots render as `<kind: phrase>`).

/** The tree node (or synthetic wrapper) that is the sentence graph's root, if any content exists yet. */
export function rootContentNode(sentence) {
  const tree = sentence.tree || [];
  const disc = tree.find((n) => n.skill === 'discourse' && !n.pending);
  if (disc?.output?.has_discourse) {
    const structure = disc.output.structure;
    if (structure && structure.expand !== true) {
      return { skill: '(structure)', output: structure, children: disc.children, role: null, pending: false };
    }
    return disc.children[0] || null;
  }
  return tree.find((n) => !n.pending && GRAPH_SKILLS.has(n.skill)) || null;
}

/** Recursively convert a tree node / pending marker into penman.js's node shape. */
export function graphNodeOf(n) {
  if (!n) return null;
  if (n.ref) return { ref: n.ref };
  if (n.pending) return { expand: true, kind: n.kind, phrase: n.phrase };
  const out = n.output || {};
  const constants = (out.relations || []).filter(([, v]) => !(v && typeof v === 'object' && v.expand === true));
  const fromChildren = (n.children || [])
    .filter((c) => c.role)
    .map((c) => [c.role, graphNodeOf(c)]);
  return { id: out.id, concept: out.concept, relations: [...constants, ...fromChildren] };
}

/* --------------------------------------------------------- path plumbing */

export function getAt(tree, path) {
  let nodes = tree, node = null;
  for (const i of path) { node = nodes?.[i]; if (!node) return null; nodes = node.children; }
  return node;
}

function setAt(tree, path, value) {
  if (path.length === 1) { tree[path[0]] = value; return; }
  const parent = getAt(tree, path.slice(0, -1));
  parent.children[path[path.length - 1]] = value;
}

/**
 * Resolve the pending marker at `path` (top-level slot or nested leaf) and
 * splice the result into the tree. This is the single entry point the UI
 * calls on a click — every branch here either returns a node or throws; it
 * never swallows a failure, so the caller's one catch block is the only
 * place an error is handled (see ui/tree.js).
 */
export async function runPendingAt(doc, sentenceIndex, path) {
  const sentence = doc.sentences[sentenceIndex];
  const marker = getAt(sentence.tree, path);
  if (!marker?.pending) throw new Error(t('pipe.notPending'));
  const language = doc.language || 'en';
  const ctx = { doc, sentence, sentenceIndex, language };

  if (marker.kind === 'discourse') {
    const { discourseNode } = await resolveDiscourse(ctx);
    setAt(sentence.tree, path, discourseNode);
  } else if (marker.kind === 'reentrancy') {
    setAt(sentence.tree, path, await resolveReentrancy(ctx));
  } else if (marker.kind === 'doc_level') {
    setAt(sentence.tree, path, await resolveDocLevel(ctx));
  } else {
    setAt(sentence.tree, path, await resolvePendingLeaf(marker, ctx));
  }
  advanceSentence(sentence);
  return sentence;
}
