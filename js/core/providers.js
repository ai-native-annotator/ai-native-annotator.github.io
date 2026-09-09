/**
 * LLM provider layer — direct browser-to-provider calls, no backend.
 *
 * Each provider exposes one function:
 *   complete({apiKey, model, system, prompt, maxTokens, signal}) -> Promise<string>
 * Callers (runner.js) own JSON extraction, since that logic is shared across
 * skills and providers.
 *
 * `system` and `prompt` are separate on purpose. A skill call is a long, stable
 * instruction block (the skill file, the language overlay, the node schema)
 * followed by a short task input that changes every call. Sending them as one
 * string worked, but it threw away the two things the split buys: the provider
 * can cache the stable half — which is most of the tokens — and the annotator
 * pays for it once per session instead of once per click.
 *
 * Adding a provider = adding one entry to PROVIDERS; nothing else in the app
 * knows provider-specific request shapes.
 */

import { logWarn } from './log.js';
import { t } from './i18n.js';

/** Below this, caching costs more than it saves (providers have a minimum). */
const CACHE_MIN_CHARS = 2000;

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5',
    get modelHint() { return t('provider.anthropic.model'); },
    get keyHint() { return t('provider.anthropic.key'); },
    async complete({ apiKey, model, system, prompt, maxTokens = 4000, signal }) {
      const body = {
        model: model || 'claude-sonnet-5',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      };
      if (system) {
        // cache_control marks the prefix as reusable across calls. Every skill
        // call in a sentence repeats this block verbatim, so this is the
        // difference between paying for the instructions once and paying for
        // them a dozen times.
        body.system = system.length >= CACHE_MIN_CHARS
          ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
          : system;
      }
      const data = await postJson('https://api.anthropic.com/v1/messages', {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }, body, signal, 'Anthropic');

      const text = (data.content || []).map((c) => c.text || '').join('');
      if (!text) {
        throw new Error(data.stop_reason === 'max_tokens'
          ? t('provider.truncated', { name: 'Anthropic' })
          : t('provider.emptyAnthropic'));
      }
      return text;
    },
  },

  openai: {
    label: 'OpenAI (GPT)',
    // A default that works on any account and has no reasoning budget to
    // starve. Faster models exist (see the hint) but "works out of the box"
    // beats "fast on some accounts" for a default.
    defaultModel: 'gpt-4.1-mini',
    get modelHint() { return t('provider.openai.model'); },
    get keyHint() { return t('provider.openai.key'); },
    async complete({ apiKey, model, system, prompt, maxTokens = 4000, signal, reasoningEffort }) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });
      const body = {
        model: model || 'gpt-4.1-mini',
        // NOT `max_tokens`: every reasoning model rejects it outright with a
        // 400, which is what made this provider unusable. `max_completion_tokens`
        // is accepted by both generations.
        max_completion_tokens: maxTokens,
        messages,
      };
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;

      const data = await postJson('https://api.openai.com/v1/chat/completions', {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      }, body, signal, 'OpenAI');

      const choice = data.choices?.[0];
      const text = choice?.message?.content || '';
      if (!text) {
        // The signature failure of a reasoning model: the whole budget went on
        // hidden reasoning tokens and nothing was left to answer with. "Empty
        // response" sends people hunting for the wrong bug.
        const reasoned = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
        throw new Error(choice?.finish_reason === 'length'
          ? t('provider.reasonedOut', { model: body.model, n: reasoned, max: maxTokens })
          : t('provider.emptyOpenai'));
      }
      return text;
    },
  },
};

/**
 * POST JSON, and survive a parameter this model happens not to accept.
 *
 * Model families disagree about their own request shape — `reasoning_effort` is
 * rejected outright by gpt-4.1, and rejected *by value* by some gpt-5 models —
 * and users bring model names this code has never heard of. Hard-coding which
 * family takes which parameter would be wrong within a release. So: if the API
 * names the offending parameter, drop it and retry once. Losing an optional
 * knob is better than failing the call over it.
 */
async function postJson(url, headers, body, signal, label) {
  let res = await fetchSafe(url, { method: 'POST', signal, headers, body: JSON.stringify(body) }, label);
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    const param = unsupportedParam(raw, body);
    if (param) {
      logWarn('provider', t('provider.droppedParam', { name: label, param, model: body.model }));
      const retry = { ...body };
      delete retry[param];
      res = await fetchSafe(url, { method: 'POST', signal, headers, body: JSON.stringify(retry) }, label);
      if (!res.ok) throw httpError(label, res, await res.text().catch(() => ''));
    } else {
      throw httpError(label, res, raw);
    }
  }
  return res.json();
}

/** The name of a request parameter the API just refused, if it named one. */
function unsupportedParam(raw, body) {
  let err;
  try { err = JSON.parse(raw).error; } catch { return null; }
  if (!err) return null;
  const named = typeof err.param === 'string' ? err.param.split('.').pop() : '';
  if (named && named in body && named !== 'model' && named !== 'messages') return named;
  // Some refusals name the parameter only in the message.
  const m = /(?:unrecognized|unsupported)[^:]*:?\s*'([a-z_]+)'/i.exec(err.message || '');
  const guess = m?.[1];
  return guess && guess in body && guess !== 'model' && guess !== 'messages' ? guess : null;
}

function httpError(label, res, body) {
  return new Error(`${label} API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

async function fetchSafe(url, init, label) {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(t('provider.netFail', { name: label, err: err.message }));
  }
}

export async function callProvider(providerId, { apiKey, model, system, prompt, maxTokens, signal, reasoningEffort }) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(t('provider.unknown', { id: providerId }));
  if (!apiKey) throw new Error(t('provider.needKey', { name: provider.label }));
  return provider.complete({ apiKey, model, system, prompt, maxTokens, signal, reasoningEffort });
}
