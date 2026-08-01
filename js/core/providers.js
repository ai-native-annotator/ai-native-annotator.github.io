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

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5',
    modelHint: '例如 claude-sonnet-5 / claude-opus-5 —— 按你账户可用的型号填写',
    keyHint: 'sk-ant-... （在 console.anthropic.com 生成）',
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
      if (!text) throw new Error('Anthropic 返回了空响应（可能被截断或触发了安全过滤）');
      return text;
    },
  },

  openai: {
    label: 'OpenAI (GPT)',
    defaultModel: '',
    modelHint: '填写你账户可用的型号 id，例如 gpt-4.1 / gpt-4o',
    keyHint: 'sk-... （在 platform.openai.com 生成）',
    async complete({ apiKey, model, prompt, maxTokens = 4000, signal }) {
      if (!model) throw new Error('请先在设置里填写 OpenAI 的模型 id（每个账户可用型号不同，无法内置默认值）');
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
      if (!text) throw new Error('OpenAI 返回了空响应');
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
    throw new Error(`${label} 请求失败（网络错误或被浏览器拦截，常见原因：无网络 / 广告拦截器 / CORS）：${err.message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function callProvider(providerId, { apiKey, model, prompt, maxTokens, signal }) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`未知的模型提供方: ${providerId}`);
  if (!apiKey) throw new Error(`${provider.label} 需要 API Key —— 请在设置里填写（只存本机，不上传任何服务器）`);
  return provider.complete({ apiKey, model, prompt, maxTokens, signal });
}
