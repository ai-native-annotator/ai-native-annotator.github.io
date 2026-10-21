/**
 * Model calls for index.html: the LLM steps (Haiku harness, agent skills, reflection),
 * and the three ways a Jev question gets answered.
 *
 * Keys are read from the same localStorage entry as the main workbench
 * (`annotator_secrets`), so a key saved there works here and the other way round.
 * Calls go from the browser straight to the provider; there is no server.
 *
 *   llm({role, system, instructions, input, tools, callTool, schema}) -> the object the
 *       model returned through the `final_result` tool (a tool loop: lookup tools first)
 *   jev(state, questions, {onManual}) -> answers in Jev's shape (see src/jev.py)
 */

const SECRETS = 'annotator_secrets';
const SETTINGS = 'skillparse_settings';

export const ROLES = {
  G: 'Generator (generate / finalize)',
  C: 'Critic (critique)',
  reflect: 'Reflection (finds skill problems, proposes edits)',
  judge: 'Jev questions answered by an LLM',
};

const DEFAULTS = {
  roles: {
    G: { provider: 'anthropic', model: 'claude-haiku-5-5' },
    C: { provider: 'anthropic', model: 'claude-haiku-5-5' },
    reflect: { provider: 'anthropic', model: 'claude-opus-5-5' },
    judge: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  },
  jev: { backend: 'llm', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', key: '', batch: 40 },
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
export async function llm({ role = 'G', system = '', instructions, input = '', tools = [], callTool,
  schema, maxTurns = 10, signal, onEvent }) {
  const cfg = settings().roles[role] || DEFAULTS.roles.G;
  const key = keys()[cfg.provider];
  if (!key) throw new Error(`No ${cfg.provider} key: add one in Settings (⚙).`);
  const final = { name: 'final_result', description: 'Return the final answer. Call this exactly once, at the end.',
    parameters: schema };
  const all = [...tools, final];
  if (cfg.provider === 'openai') return openaiLoop({ cfg, key, system, instructions, input, all, callTool, maxTurns, signal, onEvent });
  return anthropicLoop({ cfg, key, system, instructions, input, all, callTool, maxTurns, signal, onEvent });
}

async function anthropicLoop({ cfg, key, system, instructions, input, all, callTool, maxTurns, signal, onEvent }) {
  const content = [{ type: 'text', text: instructions, ...(instructions.length > 2000 ? { cache_control: { type: 'ephemeral' } } : {}) }];
  if (input) content.push({ type: 'text', text: input });
  const messages = [{ role: 'user', content }];
  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  for (let turn = 0; turn < maxTurns; turn++) {
    const last = turn === maxTurns - 1;
    const body = {
      model: cfg.model, max_tokens: 16000, messages,
      tools: all.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice: last ? { type: 'tool', name: 'final_result' } : { type: 'any' },
    };
    if (system) body.system = system;
    const data = await withRetry(() => post('https://api.anthropic.com/v1/messages', headers, body, signal, 'Anthropic'));
    messages.push({ role: 'assistant', content: data.content });
    const uses = (data.content || []).filter((c) => c.type === 'tool_use');
    const fin = uses.find((u) => u.name === 'final_result');
    if (fin) return fin.input;
    if (!uses.length) throw new Error('The model answered without calling final_result.');
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

async function openaiLoop({ cfg, key, system, instructions, input, all, callTool, maxTurns, signal, onEvent }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: input ? `${instructions}\n\n${input}` : instructions });
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  for (let turn = 0; turn < maxTurns; turn++) {
    const last = turn === maxTurns - 1;
    const body = {
      model: cfg.model, messages,
      tools: all.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: last ? { type: 'function', function: { name: 'final_result' } } : 'required',
    };
    const data = await withRetry(() => post('https://api.openai.com/v1/chat/completions', headers, body, signal, 'OpenAI'));
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned no message.');
    messages.push(msg);
    const calls = msg.tool_calls || [];
    const fin = calls.find((c) => c.function?.name === 'final_result');
    if (fin) return JSON.parse(fin.function.arguments || '{}');
    if (!calls.length) throw new Error('The model answered without calling final_result.');
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

/** Answers keyed like `questions`, in Jev's shape, from the backend chosen in Settings. */
export async function jev(state, questions, { onManual, signal } = {}) {
  const ids = Object.keys(questions || {});
  if (!ids.length) return {};
  const cfg = settings().jev;
  const cacheKey = JSON.stringify([cfg.backend, cfg.backend === 'llm' ? settings().roles.judge : cfg.model, state, questions]);
  if (jevCache.has(cacheKey)) return jevCache.get(cacheKey);
  let answers;
  if (cfg.backend === 'manual') {
    answers = await onManual(state, questions);
  } else {
    const pieces = [];
    for (let k = 0; k < ids.length; k += cfg.batch) {
      pieces.push(Object.fromEntries(ids.slice(k, k + cfg.batch).map((id) => [id, questions[id]])));
    }
    const ask = cfg.backend === 'jev' ? askJev : askLLM;
    const parts = await Promise.all(pieces.map((p) => ask(state, p, cfg, signal)));
    answers = Object.assign({}, ...parts);
  }
  jevCache.set(cacheKey, answers);
  return answers;
}

async function askJev(state, questions, cfg, signal) {
  if (!cfg.key) throw new Error('No Jev (TypeSafe) key: add one in Settings (⚙), or answer Jev questions with an LLM.');
  // src/jev.py: servers other than TypeSafe refuse an empty option description
  const qs = cfg.url.includes('typesafe') ? questions : Object.fromEntries(Object.entries(questions).map(([k, q]) => [k,
    q.type === 'choice' && q.criteria && typeof q.criteria === 'object'
      ? { ...q, criteria: Object.fromEntries(Object.entries(q.criteria).map(([o, d]) => [o, d || o])) } : q]));
  const data = await withRetry(() => post(cfg.url, {
    'content-type': 'application/json', authorization: `Bearer ${cfg.key}`,
  }, { model: cfg.model, state, questions: qs }, signal, 'Jev'));
  const missing = Object.keys(questions).filter((k) => !(k in (data.answers || {})));
  if (missing.length) throw new Error(`Jev left out ${missing.join(', ')}`);
  return data.answers;
}

/** src/jev.py _claude_prompt: the same closed questions, written out for a language model. */
export function judgePrompt(state, questions) {
  const lines = ['# State', '', JSON.stringify(state, null, 1), '', '# Questions', ''];
  for (const [k, q] of Object.entries(questions)) {
    const ins = typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions);
    const crit = q.criteria;
    if (q.type === 'choice') {
      lines.push(`[${k}] choose one option. ${ins}`);
      for (const [o, d] of Object.entries(crit)) lines.push(`  - ${o}${d ? `: ${d}` : ''}`);
    } else if (q.type === 'noul') {
      lines.push(`[${k}] yes or no. ${ins}${crit && typeof crit === 'object' ? ` (yes: ${crit.true}; no: ${crit.false})` : ''}`);
    } else {
      lines.push(`[${k}] score. ${ins}`);
      (crit || []).forEach((d, n) => lines.push(`  ${n}: ${d}`));
    }
    lines.push('');
  }
  lines.push('# Answer', '', 'Return `answers`: an object with every question id as a key. For a choice, the option exactly '
    + 'as written before its colon; for yes or no, "yes" or "no"; for a score, the level number. '
    + 'Words in backticks refer to fields of the state.');
  return lines.join('\n');
}

const JUDGE_SYSTEM = 'You are a careful judge of Chinese and English text for Uniform Meaning Representation '
  + '(UMR) annotation. You answer closed questions exactly as asked.';

/** The answers as Jev would give them: the chosen option with probability 1 (src/jev.py _ask_claude). */
export function shapeAnswers(questions, got) {
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    const a = String(got?.[k] ?? '').trim();
    if (q.type === 'choice') {
      const opts = Object.keys(q.criteria);
      const pick = opts.includes(a) ? a : (opts.find((o) => o.split(' (')[0] === a) || opts[0]);
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

async function askLLM(state, questions, cfg, signal) {
  const props = Object.fromEntries(Object.keys(questions).map((k) => [k, { type: 'string' }]));
  const out = await llm({
    role: 'judge', system: JUDGE_SYSTEM, instructions: judgePrompt(state, questions), signal,
    schema: { type: 'object', properties: { answers: { type: 'object', properties: props, required: Object.keys(props) } }, required: ['answers'] },
  });
  return shapeAnswers(questions, out.answers || out);
}
