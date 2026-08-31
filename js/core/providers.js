/**
 * LLM provider layer — direct browser-to-provider calls, no backend.
 *
 * Each provider exposes one function: complete({apiKey, model, prompt}) ->
 * Promise<string> (raw text response). Callers (runner.js) own JSON
 * extraction, since that logic is shared across skills and providers.
 *
 * Adding a provider = adding one entry to PROVIDERS; nothing else in the app
 * knows provider-specific request shapes.
 */

import { t } from './i18n.js';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5',
    get modelHint() { return t('provider.anthropic.model'); },
    get keyHint() { return t('provider.anthropic.key'); },
    async complete({ apiKey, model, prompt, maxTokens = 4000, signal }) {
      const res = await fetchSafe('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-5',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      }, 'Anthropic');
      const data = await res.json();
      const text = (data.content || []).map((c) => c.text || '').join('');
      if (!text) throw new Error(t('provider.emptyAnthropic'));
      return text;
    },
  },

  openai: {
    label: 'OpenAI (GPT)',
    defaultModel: '',
    get modelHint() { return t('provider.openai.model'); },
    get keyHint() { return t('provider.openai.key'); },
    async complete({ apiKey, model, prompt, maxTokens = 4000, signal }) {
      if (!model) throw new Error(t('provider.needModel'));
      const res = await fetchSafe('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      }, 'OpenAI');
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error(t('provider.emptyOpenai'));
      return text;
    },
  },
};

async function fetchSafe(url, init, label) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(t('provider.netFail', { name: label, err: err.message }));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function callProvider(providerId, { apiKey, model, prompt, maxTokens, signal }) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(t('provider.unknown', { id: providerId }));
  if (!apiKey) throw new Error(t('provider.needKey', { name: provider.label }));
  return provider.complete({ apiKey, model, prompt, maxTokens, signal });
}
