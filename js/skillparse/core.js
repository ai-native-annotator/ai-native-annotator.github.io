/**
 * The page's state and the actions on it. Panes read S and call these; after a change,
 * render() redraws every pane (they are small).
 *
 * Running a node: the bridge's step() either finishes it (a rule) or says what it needs:
 *   {need: "jev", state, questions}   -> models.jev()  -> bridge.answer()  (repeat per round)
 *   {need: "llm", instructions, ...}  -> models.llm()  -> bridge.complete()
 * until it is done. Nodes of one item run several at a time (Settings: steps at once); items
 * run one after another, because later items may read earlier ones.
 */

import { py } from './py.js';
import { jev, llm, settings } from './models.js';
import { edited } from './store.js';
import { t } from './i18n.js';

export const SKILLSETS = [
  { id: 'jev-k4', label: 'Jev · 中文 (rsi-jev2 K4)', lang: 'zh', jieba: true },
  { id: 'haiku-h10-zh', label: 'Haiku · 中文 (AnnoForge H10)', lang: 'zh' },
  { id: 'haiku-h10-en', label: 'Haiku · English (AnnoForge H10)', lang: 'en' },
];

export const S = {
  skillset: null, doc: null, docs: [], desc: null,
  wave: null, item: 0, node: null,
  items: [], episode: null, detail: null,
  selected: new Set(),
  tab: 'output', editing: false,
  running: 0, cancel: false,
  umr: null, umrStale: true,
  ai: {},                 // node key -> {history: [], proposal, verify}
  status: '',
};

const renderers = new Set();
export function onRender(fn) { renderers.add(fn); }
export function render() { renderers.forEach((fn) => fn()); }

let manualAnswerer = null;
export function setManualAnswerer(fn) { manualAnswerer = fn; }

export function status(text) {
  S.status = text;
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

export function nodeKey(w = S.wave, i = S.item, n = S.node) {
  return `${S.skillset}|${S.doc}|${w}|${i}|${n}`;
}

export function waveDesc(name = S.wave) {
  return S.desc?.waves.find((w) => w.name === name);
}

export function skillDesc(name) {
  return S.desc?.skills.find((s) => s.name === name);
}

// ------------------------------------------------------------------ opening

let warmed = false;
export async function warm() {
  if (warmed) return;
  status(t('warming'));
  await py('warm');
  warmed = true;
}

export async function loadDocs() {
  S.docs = await py('docs');
}

export async function open(skillset, doc) {
  S.skillset = skillset;
  S.doc = doc;
  status(t('opening', { skillset, doc }));
  const meta = SKILLSETS.find((s) => s.id === skillset);
  if (meta?.jieba || S.docs.find((d) => d.id === doc)?.lang === 'zh') await warm();
  S.desc = await py('open', { skillset, doc });
  // this browser's edited versions of the skill files
  const files = edited(skillset);
  const problems = [];
  for (const [path, vs] of Object.entries(files)) {
    if (!vs.length) continue;
    const res = await py('write_file', { path, content: vs[vs.length - 1].content });
    if (!res.ok) problems.push(`${path}: ${res.problem}`);
  }
  if (Object.keys(files).length) S.desc = await py('describe');
  S.wave = S.desc.waves[0].name;
  S.item = 0;
  S.node = null;
  S.detail = null;
  S.selected = new Set();
  S.umrStale = true;
  await refresh();
  status(problems.length ? problems.join('; ') : t('ready'));
}

export async function refresh({ detail = true } = {}) {
  if (!S.desc) return;
  S.items = await py('items', { w: S.wave });
  S.episode = await py('episode', { w: S.wave, i: S.item });
  if (S.node && !S.episode.nodes.some((n) => n.id === S.node)) S.node = null;
  if (!S.node && S.episode.nodes.length && !S.running) S.node = S.episode.nodes[0].id;
  S.detail = detail && S.node ? await py('node', { w: S.wave, i: S.item, nid: S.node }) : (detail ? null : S.detail);
  render();
}

export async function selectWave(name) {
  S.wave = name;
  S.node = null;
  S.selected = new Set();
  if (S.item >= (await py('items', { w: name })).length) S.item = 0;
  await refresh();
}

export async function selectItem(i) {
  S.item = i;
  S.node = null;
  S.editing = false;
  S.episode = await py('episode', { w: S.wave, i });
  const root = S.episode.nodes[0];
  if (root) S.node = root.id;
  await refresh();
}

export async function selectNode(id) {
  S.node = id;
  S.editing = false;
  S.detail = await py('node', { w: S.wave, i: S.item, nid: id });
  render();
}

export async function setWindow(variable, range) {
  S.desc = await py('set_window', { w: S.wave, var: variable, rng: range });
  render();
}

export async function startItem(i = S.item) {
  await py('start', { w: S.wave, i });
  S.umrStale = true;
  if (i === S.item) {
    S.node = null;
    await refresh();
    const root = S.episode.nodes[0];
    if (root) await selectNode(root.id);
  }
}

// ------------------------------------------------------------------ running

const FINDINGS = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: { problem: { type: 'string' }, fix: { type: 'string' } }, required: ['problem', 'fix'] } } },
  required: ['findings'],
};
const ANNOTATION = {
  type: 'object',
  properties: { annotation: { type: 'string', description: 'the complete annotation of the sentence, in the output format' } },
  required: ['annotation'],
};

function emitSchema(emit) {
  const props = {};
  for (const [k, ty] of Object.entries(emit)) {
    if (Array.isArray(ty)) props[k] = { type: 'string', enum: ty };
    else if (ty.startsWith('list[')) props[k] = { type: 'array', items: { type: { 'list[str]': 'string', 'list[int]': 'integer', 'list[float]': 'number', 'list[dict]': 'object' }[ty] } };
    else props[k] = { type: { str: 'string', int: 'integer', float: 'number', bool: 'boolean', dict: 'object' }[ty] || 'string' };
  }
  return { type: 'object', properties: props, required: Object.keys(props) };
}

/** Run one node to the end. Returns the bridge's final result. */
export async function drive(w, i, nid, signal) {
  let r = await py('step', { w, i, nid });
  try {
    while (r.need) {
      if (S.cancel) throw new Error(t('stopped'));
      if (r.need === 'jev') {
        status(t('running', { what: `${nid} · Jev ${t('round', { n: r.round })} · ${t('questions', { n: Object.keys(r.questions || {}).length })}` }));
        const answers = await jev(r.state, r.questions, { onManual: manualAnswerer, signal });
        r = await py('answer', { w, i, nid, answers });
      } else if (r.need === 'llm') {
        status(t('running', { what: `${nid} · ${settings().roles[r.role]?.model || r.role}` }));
        const schema = r.mode === 'findings' ? FINDINGS : r.mode === 'annotation' ? ANNOTATION : emitSchema(r.emit);
        const out = await llm({
          role: r.role, system: r.system, instructions: r.instructions, input: r.input, tools: r.tools || [], schema, signal,
          callTool: (name, args) => py('tool', { w, i, nid, name, args }),
        });
        r = await py('complete', { w, i, nid, output: out });
      } else {
        throw new Error(`unknown need ${r.need}`);
      }
    }
  } catch (err) {
    await py('fail', { w, i, nid, error: err.message }).catch(() => {});
    throw err;
  }
  S.umrStale = true;
  return r;
}

let controller = null;

async function guarded(fn) {
  S.running++;
  S.cancel = false;
  controller = controller || new AbortController();
  document.getElementById('btn-stop').hidden = false;
  try {
    return await fn(controller.signal);
  } finally {
    S.running--;
    if (!S.running) {
      document.getElementById('btn-stop').hidden = true;
      controller = null;
      // buttons disabled while running come back; a run that ended with nothing selected
      // selects the item's first step, so the output and AI panes have something to show
      const first = S.episode?.nodes?.[0]?.id;
      if (!S.node && first) selectNode(first).catch(() => render());
      else render();
    }
  }
}

export function stop() {
  S.cancel = true;
  controller?.abort();
  status(t('stopped'));
}

export async function runNode(nid = S.node) {
  return guarded(async (signal) => {
    try {
      const r = await drive(S.wave, S.item, nid, signal);
      status(r.status === 'error' ? `${t('error')}: ${r.error}` : t('doneRun', { n: 1 }));
      return r;
    } catch (err) {
      status(`${t('error')}: ${err.message}`);
      return null;
    } finally {
      await refresh({ detail: false });
      if (S.node) S.detail = await py('node', { w: S.wave, i: S.item, nid: S.node }).catch(() => null);
      render();
    }
  });
}

/** Run every pending node of one item, several at a time. */
async function runEpisodeInner(w, i, signal, { onlyNext = false } = {}) {
  const limit = Math.max(1, settings().concurrency);
  let done = 0;
  let failed = null;
  const inflight = new Map();         // node id -> its promise
  for (;;) {
    if (S.cancel || failed) break;
    const pending = (await py('pending', { w, i })).filter((id) => !inflight.has(id));
    if (!pending.length && !inflight.size) break;
    for (const id of pending.slice(0, Math.max(0, limit - inflight.size))) {
      inflight.set(id, drive(w, i, id, signal).then(() => { done++; })
        .catch((err) => { failed = failed || err; })
        .finally(() => inflight.delete(id)));
    }
    if (inflight.size) await Promise.race(inflight.values());
    if (w === S.wave && i === S.item) refresh({ detail: false });
    if (onlyNext && done) break;
  }
  await Promise.allSettled(inflight.values());
  if (failed) throw failed;
  return done;
}

export async function runItem(i = S.item, opts = {}) {
  return guarded(async (signal) => {
    try {
      const ep = await py('episode', { w: S.wave, i });
      if (!ep.started) await py('start', { w: S.wave, i });
      const now = await py('episode', { w: S.wave, i });
      if (now.error) {
        status(now.error);
        return;
      }
      const n = await runEpisodeInner(S.wave, i, signal, opts);
      status(t('doneRun', { n }));
    } catch (err) {
      status(`${t('error')}: ${err.message}`);
    } finally {
      await refresh();
    }
  });
}

export async function runItems(list) {
  return guarded(async (signal) => {
    let n = 0;
    try {
      for (const i of list) {
        if (S.cancel) break;
        const ep = await py('episode', { w: S.wave, i });
        if (!ep.started || ep.stale || ep.error) await py('start', { w: S.wave, i });
        const now = await py('episode', { w: S.wave, i });
        if (now.error) throw new Error(`#${i + 1}: ${now.error}`);
        n += await runEpisodeInner(S.wave, i, signal);
        await refresh({ detail: false });
      }
      status(t('doneRun', { n }));
    } catch (err) {
      status(`${t('error')}: ${err.message}`);
    } finally {
      await refresh();
    }
  });
}

/** Everything `list` needs, what that needs in turn, then `list` itself: in an order that can run. */
async function plan(list, out = [], seen = new Set()) {
  for (const [w, i] of list) {
    const key = `${w}|${i}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await plan(await py('needs', { w, i }), out, seen);
    out.push([w, i]);
  }
  return out;
}

/** Run the items an item needs (and what they need), then restart the item itself. */
export async function runNeeds(needs) {
  return guarded(async (signal) => {
    let n = 0;
    try {
      for (const [w, i] of await plan(needs)) {
        if (S.cancel) break;
        await py('start', { w, i });
        const ep = await py('episode', { w, i });
        if (ep.error) throw new Error(`${w} #${i + 1}: ${ep.error}`);
        n += await runEpisodeInner(w, i, signal);
      }
      await py('start', { w: S.wave, i: S.item });
      status(t('doneRun', { n }));
    } catch (err) {
      status(`${t('error')}: ${err.message}`);
    } finally {
      await refresh();
    }
  });
}

// ------------------------------------------------------------------ corrections

export async function saveOutput(output) {
  const r = await py('set_output', { w: S.wave, i: S.item, nid: S.node, output });
  S.umrStale = true;
  S.editing = false;
  await refresh();
  return r;
}

export async function resetNode(nid = S.node) {
  await py('reset', { w: S.wave, i: S.item, nid });
  S.umrStale = true;
  await refresh();
}

export async function assembled(autoAlign = true) {
  if (!S.umrStale && S.umr && S.umr.auto === autoAlign) return S.umr;
  S.umr = { ...(await py('render', { auto_align: autoAlign })), auto: autoAlign };
  S.umrStale = false;
  return S.umr;
}
