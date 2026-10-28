/**
 * The page's state and the actions on it. Panes read S and call these; after a change,
 * render() redraws every pane (they are small).
 *
 * Running a node: the bridge's step() either finishes it (a rule) or says what it needs:
 *   {need: "jev", state, questions}   -> models.jev() (kind: jev, i.e. sent_type)
 *                                         -> bridge.answer()  (repeat per round)
 *   {need: "llm", instructions, input, tools, emit}   (kind: agent: the skill.md prompt)
 *                                     -> models.llm() (Haiku; tool calls run in the bridge)
 *                                         -> bridge.complete()  (one retry if the answer is invalid)
 * until it is done. A step runs only when every finished step of its item has been confirmed
 * (or corrected) by the person: an item never runs on by itself. Different items can each run
 * their next step at the same time (runNextAll).
 */

import { py } from './py.js';
import { jev, llm, settings } from './models.js';
import { edited } from './store.js';
import { toast } from './ui.js';
import { t } from './i18n.js';

export const SKILLSETS = [
  { id: 'web-zh', label: '中文 · sent_type: Jev, 其余: Haiku (R42 + V12)', lang: 'zh' },
  { id: 'web-en', label: 'English · sent_type: Jev, rest: Haiku (umr-tree + V12)', lang: 'en' },
];

export const S = {
  skillset: null, doc: null, docs: [], desc: null,
  wave: null, item: 0, node: null,
  items: [], episode: null, detail: null,
  tab: 'graph', editing: false, hinting: false,
  running: 0, cancel: false,
  umr: null, umrStale: true, graphStamp: 0, graphs: new Map(),
  ai: {},                 // node key -> {history: [], proposal, verify}
  status: '',
};

const renderers = new Set();
export function onRender(fn) { renderers.add(fn); }
export function render() { renderers.forEach((fn) => fn()); }

let manualAnswerer = null;
export function setManualAnswerer(fn) { manualAnswerer = fn; }

/** The results changed: the assembled .umr and the drawn graphs are out of date. */
export function changed() {
  S.umrStale = true;
  S.graphStamp++;
  S.graphs.clear();
}

/** Sentence i's assembled graph (bridge.graph), cached until the results change. */
export async function sentenceGraph(i) {
  const key = `${S.skillset}|${S.doc}|${i}|${S.graphStamp}`;
  if (!S.graphs.has(key)) S.graphs.set(key, py('graph', { i }));
  try {
    return await S.graphs.get(key);
  } catch (err) {
    S.graphs.delete(key);
    throw err;
  }
}

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


export async function loadDocs() {
  S.docs = await py('docs');
}

export async function open(skillset, doc) {
  S.skillset = skillset;
  S.doc = doc;
  status(t('opening', { skillset, doc }));
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
  changed();
  await refresh();
  const loaded = S.desc.loaded;
  if (loaded) {
    const more = loaded.problems.length + loaded.more_problems;
    problems.unshift(t('loadedReport', { n: loaded.sentences, steps: loaded.steps, how: t(`loadedHow.${loaded.alignment}`) })
      + (more ? ` ${t('loadedProblems', { n: more, list: loaded.problems.slice(0, 3).join('; ') })}` : ''));
  }
  status(problems.length ? problems.join('; ') : t('ready'));
  if (loaded) toast(problems[0], 9000);
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
  if (S.item >= (await py('items', { w: name })).length) S.item = 0;
  await refresh();
}

export async function selectItem(i) {
  S.item = i;
  S.node = null;
  S.editing = false;
  S.hinting = false;
  S.episode = await py('episode', { w: S.wave, i });
  const root = S.episode.nodes[0];
  if (root) S.node = root.id;
  await refresh();
}

export async function selectNode(id) {
  S.node = id;
  S.editing = false;
  S.hinting = false;
  S.detail = await py('node', { w: S.wave, i: S.item, nid: id });
  render();
}

export async function setWindow(variable, range) {
  S.desc = await py('set_window', { w: S.wave, var: variable, rng: range });
  render();
}

export async function startItem(i = S.item) {
  await py('start', { w: S.wave, i });
  changed();
  if (i === S.item) {
    S.node = null;
    await refresh();
    const root = S.episode.nodes[0];
    if (root) await selectNode(root.id);
  }
}

// ------------------------------------------------------------------ running

function emitSchema(emit) {
  const props = {};
  for (const [k, ty] of Object.entries(emit)) {
    if (Array.isArray(ty)) props[k] = { type: 'string', enum: ty };
    else if (ty.startsWith('list[')) props[k] = { type: 'array', items: { type: { 'list[str]': 'string', 'list[int]': 'integer', 'list[float]': 'number', 'list[dict]': 'object' }[ty] } };
    else props[k] = { type: { str: 'string', int: 'integer', float: 'number', bool: 'boolean', dict: 'object' }[ty] || 'string' };
  }
  return { type: 'object', properties: props, required: Object.keys(props) };
}

// every model call (a Jev round, a Haiku call) takes a slot: at most `concurrency` at once,
// however many items and steps are running
let slotsBusy = 0;
const slotQueue = [];
async function withSlot(fn) {
  if (slotsBusy >= Math.max(1, settings().concurrency)) await new Promise((r) => slotQueue.push(r));
  slotsBusy++;
  try {
    return await fn();
  } finally {
    slotsBusy--;
    slotQueue.shift()?.();
  }
}

/** Run one node to the end. Returns the bridge's final result. */
export async function drive(w, i, nid, signal, { hint } = {}) {
  let r = await py('step', { w, i, nid, ...(hint === undefined ? {} : { hint }) });
  try {
    while (r.need) {
      if (S.cancel) throw new Error(t('stopped'));
      if (r.need === 'jev') {
        const n = Object.keys(r.questions || {}).length;
        status(t('running', { what: `${nid} ${r.skill} · Jev · ${t('round', { n: r.round })} · ${t('questions', { n })}` }));
        const answers = await withSlot(() => jev(r.state, r.questions, { onManual: manualAnswerer, signal }));
        r = await py('answer', { w, i, nid, answers });
      } else if (r.need === 'llm') {
        status(t('running', { what: `${nid} ${r.skill} · ${settings().roles.haiku.model}${r.retry ? ' · retry' : ''}` }));
        const out = await withSlot(() => llm({
          role: 'haiku', system: r.system, instructions: r.instructions, input: r.input, tools: r.tools || [],
          schema: emitSchema(r.emit), signal, callTool: (name, args) => py('tool', { w, i, nid, name, args }),
        }));
        r = await py('complete', { w, i, nid, output: out });
      } else {
        throw new Error(`unknown need ${r.need}`);
      }
    }
  } catch (err) {
    await py('fail', { w, i, nid, error: err.message }).catch(() => {});
    throw err;
  }
  changed();
  return r;
}

let controller = null;

/** S.running, mirrored on <body data-running> so a test can wait for the page to settle. */
function busy(delta) {
  S.running += delta;
  document.body.dataset.running = String(S.running);
}

async function guarded(fn) {
  busy(1);
  S.cancel = false;
  controller = controller || new AbortController();
  document.getElementById('btn-stop').hidden = false;
  document.getElementById('btn-next-all').disabled = true;
  try {
    return await fn(controller.signal);
  } finally {
    busy(-1);
    if (!S.running) {
      document.getElementById('btn-stop').hidden = true;
      document.getElementById('btn-next-all').disabled = false;
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

/** Run (or re-run) one step; `hint` is the person's note that goes in after its input. */
export async function runNode(nid = S.node, { hint } = {}) {
  return guarded(async (signal) => {
    try {
      const r = await drive(S.wave, S.item, nid, signal, { hint });
      status(r.status === 'error' ? `${t('error')}: ${r.error}` : t('checkStep', { id: nid }));
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

/**
 * Run the next step of item i of the current wave, if its finished steps are all confirmed:
 * starts the item when it has not been started. Returns {ran: id} | {awaiting: [ids]} |
 * {done: true} | {needs: [...]} | {error}.
 */
async function nextStep(w, i, signal) {
  let ep = await py('episode', { w, i });
  // an item that was waiting for earlier waves is made again once they are there
  if (!ep.started || (ep.error && ep.needs?.length)) ep = await py('start', { w, i });
  if (ep.error) return ep.needs?.length ? { needs: ep.needs } : { error: ep.error };
  const nx = await py('next_step', { w, i });
  if (!nx.node) return nx;
  const r = await drive(w, i, nx.node, signal);
  return { ran: nx.node, status: r.status, error: r.error };
}

/** One step of the selected item; the step that ran is selected, for the person to check. */
export async function runNext(i = S.item) {
  return guarded(async (signal) => {
    try {
      const r = await nextStep(S.wave, i, signal);
      if (r.awaiting) status(t('confirmFirst', { list: r.awaiting.join(', ') }));
      else if (r.running) status(t('running', { what: r.running.join(', ') }));
      else if (r.done) status(t('itemDone'));
      else if (r.needs) status(t('needs', { list: r.needs.map(([w, k]) => `${w} #${k + 1}`).join(', ') }));
      else if (r.error && !r.ran) status(r.error);
      else status(r.status === 'error' ? `${t('error')}: ${r.error}` : t('checkStep', { id: r.ran }));
      await refresh({ detail: false });
      if (r.ran && i === S.item) {
        if (S.tab === 'graph') S.tab = 'output';
        await selectNode(r.ran);
      }
    } catch (err) {
      status(`${t('error')}: ${err.message}`);
      await refresh();
    }
  });
}

/**
 * Every item of the wave runs its next step, several items at a time (the wave's `parallel`);
 * an item whose last step is not confirmed yet, or that is finished, is left alone.
 */
export async function runNextAll(w = S.wave) {
  return guarded(async (signal) => {
    const items = await py('items', { w });
    const tally = { ran: 0, errors: 0, awaiting: 0, done: 0, blocked: 0 };
    let next = 0;
    const worker = async () => {
      while (next < items.length && !S.cancel) {
        const i = items[next++].index;
        try {
          const r = await nextStep(w, i, signal);
          if (r.ran) { tally.ran++; if (r.status === 'error') tally.errors++; } else if (r.awaiting) tally.awaiting++;
          else if (r.done) tally.done++;
          else tally.blocked++;
        } catch {
          tally.ran++;
          tally.errors++;
        }
        if (w === S.wave) refresh({ detail: false });
      }
    };
    const width = Math.max(1, Math.min(waveDesc(w)?.parallel || 1, items.length));
    await Promise.all(Array.from({ length: width }, worker));
    status(S.cancel ? t('stopped') : t('allNextDone', tally));
    await refresh();
    return tally;
  });
}

/** The selected step's output is right. */
export async function confirmNode(nid = S.node) {
  busy(1);
  try {
    await py('confirm', { w: S.wave, i: S.item, nid });
    changed();
    await refresh();
  } finally {
    busy(-1);
  }
}

export async function confirmAndNext(nid = S.node) {
  busy(1);
  render();
  try {
    await py('confirm', { w: S.wave, i: S.item, nid });
    changed();
  } finally {
    busy(-1);
  }
  await runNext();
}

// ------------------------------------------------------------------ corrections

export async function saveOutput(output) {
  const r = await py('set_output', { w: S.wave, i: S.item, nid: S.node, output });
  changed();
  S.editing = false;
  S.hinting = false;
  await refresh();
  return r;
}

export async function resetNode(nid = S.node) {
  await py('reset', { w: S.wave, i: S.item, nid });
  changed();
  await refresh();
}

export async function assembled(autoAlign = true) {
  if (!S.umrStale && S.umr && S.umr.auto === autoAlign) return S.umr;
  S.umr = { ...(await py('render', { auto_align: autoAlign })), auto: autoAlign };
  S.umrStale = false;
  return S.umr;
}
