/**
 * Model calls for index.html, as SkillParseUMR's Runner makes them (src/skill_callable.py):
 *
 *   kind: jev   (sent_type) its closed questions go to Jev, TypeSafe's judgment model, through
 *               OpenRouter's systemone endpoint (typesafe/jev-1.13), as src/jev.py sends them
 *   kind: agent (every other model skill) its skill.md prompt goes to Haiku, with the skill's tools;
 *               the answer comes back through the `final_result` output tool (src/agent.py)
 *
 *   jev(state, questions, {onManual}) -> answers in Jev's shape
 *   llm({role, system, instructions, input, tools, callTool, schema}) -> the final_result object
 *
 * One OpenRouter key runs both. Keys are read from the same localStorage entry as the classic
 * workbench (`annotator_secrets`). Calls go from the browser straight to the provider.
 */

const SECRETS = 'annotator_secrets';
const SETTINGS = 'skillparse_settings_v4';

export const ROLES = {
  haiku: 'Haiku: runs every kind: agent skill (its skill.md prompt)',
  reflect: 'Reflection (finds skill problems, proposes edits)',
};

export const PROVIDERS = ['openrouter', 'anthropic', 'openai'];

/** The model name each provider knows a role's model by (OpenRouter and Anthropic name Haiku differently). */
export const MODEL_DEFAULTS = {
  haiku: { openrouter: 'anthropic/claude-haiku-5.5', anthropic: 'claude-haiku-5-5', openai: '' },
  reflect: { openrouter: 'anthropic/claude-sonnet-5.5', anthropic: 'claude-sonnet-5-5', openai: '' },
};

/**
 * The models the toolbar switches the agent skills between, by the name each provider knows them
 * by. Haiku is the default; a stronger model is there for the steps Haiku gets wrong.
 */
export const MODEL_CHOICES = [
  { id: 'haiku', label: 'Haiku 5.5', anthropic: 'claude-haiku-5-5', openrouter: 'anthropic/claude-haiku-5.5' },
  { id: 'sonnet', label: 'Sonnet 5.5', anthropic: 'claude-sonnet-5-5', openrouter: 'anthropic/claude-sonnet-5.5' },
  { id: 'opus', label: 'Opus 5.5', anthropic: 'claude-opus-5-5', openrouter: 'anthropic/claude-opus-5.5' },
  { id: 'fable', label: 'Fable 5.1', anthropic: 'claude-fable-5-1', openrouter: 'anthropic/claude-fable-5.1' },
  { id: 'sol', label: 'GPT-6.1 Sol', openai: 'gpt-6.1-sol', openrouter: 'openai/gpt-6.1-sol' },
];

/** Which of MODEL_CHOICES a role runs now, or null (a model typed in Settings). */
export function currentChoice(role = 'haiku') {
  const { provider, model } = settings().roles[role];
  return MODEL_CHOICES.find((c) => c[provider] === model) || null;
}

/**
 * Switch a role to one of MODEL_CHOICES: through the provider it uses now when that provider has
 * the model, else the first one that does and has a key (else simply the first one).
 */
export function pickModel(id, role = 'haiku') {
  const choice = MODEL_CHOICES.find((c) => c.id === id);
  if (!choice) return null;
  const cfg = settings();
  const k = keys();
  const offered = PROVIDERS.filter((p) => choice[p]);
  const provider = choice[cfg.roles[role].provider] ? cfg.roles[role].provider
    : offered.find((p) => k[p]) || offered[0];
  cfg.roles[role] = { provider, model: choice[provider] };
  saveSettings(cfg);
  return cfg.roles[role];
}

// models that refuse a forced tool call (tool_choice any / tool, OpenAI-style "required"): the
// answer is still asked for through final_result, with tool_choice auto and an instruction
const NO_FORCED_TOOL = /(opus-5[.-]5|sonnet-5[.-]5|fable-5[.-]1|mythos-5[.-]1)/;
// models whose refusals the Claude API can hand to another model (server-side fallback)
const FALLBACK = /^claude-(opus-5-5|sonnet-5-5|fable-5-1)$/;
const ANSWER_NOTE = 'When you have the answer, call the final_result tool with it; do not answer in text.';
const REMIND = 'Call the final_result tool now with your answer.';

const DEFAULTS = {
  roles: {
    haiku: { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' },
    reflect: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' },
  },
  // rsi-batch/run_tests.sh: JEV_URL=https://openrouter.ai/api/v1/systemone JEV_MODEL=typesafe/jev-1.13
  // backend "jev" (Jev answers) or "manual" (the person does)
  jev: { backend: 'jev', url: 'https://openrouter.ai/api/v1/systemone', model: 'typesafe/jev-1.13',
    key: '', batch: 40 },
  concurrency: 6,
};

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function settings() {
  const s = readJson(SETTINGS);
  return {
    roles: { ...DEFAULTS.roles, ...(s.roles || {}) },
    jev: { ...DEFAULTS.jev, ...(s.jev || {}) },
    concurrency: s.concurrency || DEFAULTS.concurrency,
  };
}

export function saveSettings(next) {
  writeJson(SETTINGS, next);
}

export function keys() {
  return readJson(SECRETS).apiKeys || {};
}

export function saveKey(provider, key) {
  const s = readJson(SECRETS);
  s.apiKeys = { ...(s.apiKeys || {}), [provider]: key.trim() };
  writeJson(SECRETS, s);
}

// ------------------------------------------------------------------ HTTP

async function post(url, headers, body, signal, label) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(`${label}: the request did not reach the server (${err.message}). `
      + 'A network block or the server refusing a browser request (CORS) looks like this.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const e = new Error(`${label} ${res.status}: ${text.slice(0, 400)}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function withRetry(fn, tries = 4) {
  for (let k = 0; ; k++) {
    try {
      return await fn();
    } catch (err) {
      const retry = err.status === 429 || err.status === 529 || (err.status >= 500 && err.status < 600);
      if (!retry || k >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, Math.min(2 ** k * 1000, 15000)));
    }
  }
}

// ------------------------------------------------------------------ LLM with tools

/**
 * One model call that may look things up first. `tools` are [{name, description,
 * parameters}] (JSON schema); `callTool(name, args)` runs one and returns text. The
 * answer comes back through a `final_result` tool whose input is `schema`, so it is
 * always an object, never prose to dig JSON out of.
 */
export async function llm({ role = 'reflect', system = '', instructions, input = '', tools = [], callTool,
  schema, maxTurns = 10, signal, onEvent }) {
  const cfg = settings().roles[role] || DEFAULTS.roles[role];
  const key = keys()[cfg.provider];
  if (!key) throw new Error(`No ${cfg.provider} key: add one in Settings (⚙).`);
  const final = { name: 'final_result', description: 'Return the final answer. Call this exactly once, at the end.',
    parameters: schema };
  const all = [...tools, final];
  if (cfg.provider === 'openai' || cfg.provider === 'openrouter') {
    const url = cfg.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    return openaiLoop({ cfg, key, url, system, instructions, input, all, callTool, maxTurns, signal, onEvent });
  }
  return anthropicLoop({ cfg, key, system, instructions, input, all, callTool, maxTurns, signal, onEvent });
}

async function anthropicLoop({ cfg, key, system, instructions, input, all, callTool, maxTurns, signal, onEvent }) {
  const content = [{ type: 'text', text: instructions, ...(instructions.length > 2000 ? { cache_control: { type: 'ephemeral' } } : {}) }];
  if (input) content.push({ type: 'text', text: input });
  const messages = [{ role: 'user', content }];
  const free = NO_FORCED_TOOL.test(cfg.model);
  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  // a refusal on these models is answered by a fallback model the API picks by its category
  if (FALLBACK.test(cfg.model)) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  let reminded = false;
  for (let turn = 0; turn < maxTurns; turn++) {
    const last = turn === maxTurns - 1;
    const body = {
      model: cfg.model, max_tokens: 16000, messages,
      tools: all.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice: free ? { type: 'auto' } : last ? { type: 'tool', name: 'final_result' } : { type: 'any' },
    };
    if (FALLBACK.test(cfg.model)) body.fallbacks = 'default';
    const sys = [system, free ? ANSWER_NOTE : ''].filter(Boolean).join('\n\n');
    if (sys) body.system = sys;
    const data = await withRetry(() => post('https://api.anthropic.com/v1/messages', headers, body, signal, 'Anthropic'));
    if (data.stop_reason === 'refusal') {
      throw new Error(`${cfg.model} declined this step${data.stop_details?.category ? ` (${data.stop_details.category})` : ''}.`);
    }
    messages.push({ role: 'assistant', content: data.content });
    const uses = (data.content || []).filter((c) => c.type === 'tool_use');
    const fin = uses.find((u) => u.name === 'final_result');
    if (fin) return fin.input;
    if (!uses.length) {
      // answered in text with tool_choice auto: ask once more for final_result
      if (free && !reminded && !last) {
        reminded = true;
        messages.push({ role: 'user', content: REMIND });
        continue;
      }
      throw new Error('The model answered without calling final_result.');
    }
    const results = [];
    for (const u of uses) {
      const out = callTool ? await callTool(u.name, u.input) : `no tool ${u.name}`;
      onEvent?.({ tool: u.name, args: u.input, result: out });
      results.push({ type: 'tool_result', tool_use_id: u.id, content: String(out).slice(0, 20000) });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('No final answer after the tool turns.');
}

async function openaiLoop({ cfg, key, url, system, instructions, input, all, callTool, maxTurns, signal, onEvent }) {
  const free = NO_FORCED_TOOL.test(cfg.model);
  const messages = [];
  const sys = [system, free ? ANSWER_NOTE : ''].filter(Boolean).join('\n\n');
  if (sys) messages.push({ role: 'system', content: sys });
  messages.push({ role: 'user', content: input ? `${instructions}\n\n${input}` : instructions });
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  let reminded = false;
  for (let turn = 0; turn < maxTurns; turn++) {
    const last = turn === maxTurns - 1;
    const body = {
      model: cfg.model, messages,
      tools: all.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: free ? 'auto' : last ? { type: 'function', function: { name: 'final_result' } } : 'required',
    };
    const data = await withRetry(() => post(url, headers, body, signal, cfg.provider === 'openai' ? 'OpenAI' : 'OpenRouter'));
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error(`${cfg.model} returned no message.`);
    if (choice.finish_reason === 'content_filter' || msg.refusal) throw new Error(`${cfg.model} declined this step.`);
    messages.push(msg);
    const calls = msg.tool_calls || [];
    const fin = calls.find((c) => c.function?.name === 'final_result');
    if (fin) return JSON.parse(fin.function.arguments || '{}');
    if (!calls.length) {
      if (free && !reminded && !last) {
        reminded = true;
        messages.push({ role: 'user', content: REMIND });
        continue;
      }
      throw new Error('The model answered without calling final_result.');
    }
    for (const c of calls) {
      let args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* keep {} */ }
      const out = callTool ? await callTool(c.function.name, args) : `no tool ${c.function.name}`;
      onEvent?.({ tool: c.function.name, args, result: out });
      messages.push({ role: 'tool', tool_call_id: c.id, content: String(out).slice(0, 20000) });
    }
  }
  throw new Error('No final answer after the tool turns.');
}

// ------------------------------------------------------------------ Jev

const jevCache = new Map();

/** Answers keyed like `questions`, in Jev's shape (from Jev, or from the person). */
export async function jev(state, questions, { onManual, signal } = {}) {
  const ids = Object.keys(questions || {});
  if (!ids.length) return {};
  const cfg = settings().jev;
  const who = cfg.backend === 'manual' ? 'manual' : 'jev';
  const cacheKey = JSON.stringify([who, cfg.model, state, questions]);
  if (jevCache.has(cacheKey)) return jevCache.get(cacheKey);
  let answers;
  if (who === 'manual') {
    answers = await onManual(state, questions);
  } else {
    const pieces = [];
    for (let k = 0; k < ids.length; k += cfg.batch) {
      pieces.push(Object.fromEntries(ids.slice(k, k + cfg.batch).map((id) => [id, questions[id]])));
    }
    answers = Object.assign({}, ...(await Promise.all(pieces.map((q) => askJev(state, q, cfg, signal)))));
  }
  for (const id of Object.keys(answers)) answers[id] = { ...answers[id], by: who };
  jevCache.set(cacheKey, answers);
  return answers;
}

async function askJev(state, questions, cfg, signal) {
  const key = cfg.key || (cfg.url.includes('openrouter.ai') ? keys().openrouter : '');
  if (!key) throw new Error('No Jev key: add an OpenRouter key (or a Jev key) in Settings (⚙).');
  // src/jev.py: servers other than TypeSafe refuse an empty option description
  const qs = cfg.url.includes('typesafe') ? questions : Object.fromEntries(Object.entries(questions).map(([k, q]) => [k,
    q.type === 'choice' && q.criteria && typeof q.criteria === 'object'
      ? { ...q, criteria: Object.fromEntries(Object.entries(q.criteria).map(([o, d]) => [o, d || o])) } : q]));
  const data = await withRetry(() => post(cfg.url, {
    'content-type': 'application/json', authorization: `Bearer ${key}`,
  }, { model: cfg.model, state, questions: qs }, signal, 'Jev'));
  const missing = Object.keys(questions).filter((k) => !(k in (data.answers || {})));
  if (missing.length) throw new Error(`Jev left out ${missing.join(', ')}`);
  return data.answers;
}

/**
 * Picked answers in Jev's shape: the chosen option with probability 1 (src/jev.py _ask_claude); an
 * answer that is not an option becomes the first option. Used for the person's answers.
 */
export function shapeAnswers(questions, got) {
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    const a = String(got?.[k] ?? '').trim();
    if (q.type === 'choice') {
      const opts = Object.keys(q.criteria);
      let pick = opts.includes(a) ? a : opts.find((o) => o.split(' (')[0] === a || o.toLowerCase() === a.toLowerCase());
      pick = pick || opts[0];
      answers[k] = { type: 'choice', choice: pick, confidence: 1, probabilities: Object.fromEntries(opts.map((o) => [o, o === pick ? 1 : 0])) };
    } else if (q.type === 'noul') {
      answers[k] = { type: 'noul', noul: /^(yes|true|是)/i.test(a) ? 1 : 0 };
    } else {
      const n = /^\d+$/.test(a) ? Number(a) : 0;
      answers[k] = { type: 'score', score: n, confidence: 1, probabilities: Object.fromEntries((q.criteria || []).map((_, i) => [String(i), i === n ? 1 : 0])) };
    }
  }
  return answers;
}
