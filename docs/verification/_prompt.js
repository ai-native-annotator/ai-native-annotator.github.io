/**
 * What a model request actually carries, as one string.
 *
 * A skill call is sent as two parts: the stable instructions (skill file,
 * language overlay, node schema) go in `system` so the provider can cache
 * them, and the task input goes in the user message. The two providers put
 * `system` in different places — Anthropic takes a top-level `system` (an
 * array of blocks when it is cacheable), OpenAI takes a system message.
 *
 * Every test here asserts on "what did the pipeline send", not on "which field
 * did it land in", so they all go through this. Reading `messages[0].content`
 * directly would silently stop seeing the instructions the moment they moved.
 */
function promptOf(postData) {
  const req = typeof postData === 'string' ? JSON.parse(postData) : postData;
  const sys = Array.isArray(req.system)
    ? req.system.map((s) => s.text || '').join('\n')
    : (typeof req.system === 'string' ? req.system : '');
  const msgs = (req.messages || [])
    .map((m) => (typeof m.content === 'string'
      ? m.content
      : (m.content || []).map((c) => c.text || '').join('\n')))
    .join('\n\n');
  return [sys, msgs].filter(Boolean).join('\n\n---\n\n');
}

module.exports = { promptOf };
