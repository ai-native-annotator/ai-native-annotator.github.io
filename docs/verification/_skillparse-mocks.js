/**
 * Stand-ins for the models skillparse tests call (no key, no network to any provider):
 *
 *   systemone  OpenRouter's Jev endpoint: the first option ("predicate" when offered), "no"
 *   chat       OpenRouter chat completions: Haiku running a kind: agent skill (calls get_example
 *              once, then answers final_result with an emit that fits the schema), or the
 *              reflection (a one-edit proposal to the first skill file in the prompt)
 *   anthropic  the Anthropic Messages API, for Haiku through an Anthropic key
 *
 *   const { calls, anth, systemone, chat, anthropic } = require('./_skillparse-mocks.js')();
 *   await ctx.route('https://openrouter.ai/api/v1/systemone', systemone);
 */
module.exports = function mocks() {
  const calls = { jev: 0, questions: 0, haiku: 0, reflect: 0, tools: {}, systems: new Set(), heads: 0, skills: new Set(),
    jevStates: [], inputs: [] };

  /** Jev: the first option of every choice ("predicate" when it is one), "no" to every yes/no. */
  async function systemone(route) {
    const body = JSON.parse(route.request().postData());
    calls.jev++;
    calls.jevStates.push(body.state);
    const answers = {};
    for (const [k, q] of Object.entries(body.questions)) {
      calls.questions++;
      if (q.type === 'choice') {
        const opts = Object.keys(q.criteria);
        const pick = opts.includes('predicate') ? 'predicate' : opts[0];
        answers[k] = { type: 'choice', choice: pick, confidence: 0.9, probabilities: Object.fromEntries(opts.map((o) => [o, o === pick ? 0.9 : 0.1 / Math.max(1, opts.length - 1)])) };
      } else if (q.type === 'noul') {
        answers[k] = { type: 'noul', noul: 0.1 };
      } else {
        answers[k] = { type: 'score', score: 0, probabilities: { 0: 1 } };
      }
    }
    return route.fulfill({ json: { answers, model: body.model, usage: {} } });
  }

  /** An emit that fits the final_result schema; a skill that writes a graph writes one node. */
  function emitFor(schema) {
    const out = {};
    for (const [k, p] of Object.entries(schema.properties || {})) {
      out[k] = p.enum ? p.enum[0] : p.type === 'array' ? [] : p.type === 'object' ? {} : p.type === 'string' ? '' : 0;
    }
    if ('graph' in out) {
      out.graph = { nodes: [{ var: 'x', concept: 'test-01', span: [1, 1] }], edges: [], attrs: [] };
      if ('alignment' in out) out.alignment = [1, 1];
      // predicate writes one placeholder, which sent_type then takes (and the dispatcher stops
      // the second time round: same skill and input as an ancestor)
      if ('frame' in out) {
        out.graph.edges = [['x', 'ARG0', 'x1']];
        out.open = [{ var: 'x1', text: 'placeholder', span: [2, 2] }];
      }
    }
    return out;
  }

  const reply = (route, name, args) => route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: null,
    tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] } });

  async function chat(route) {
    const body = JSON.parse(route.request().postData());
    const sys = body.messages.find((m) => m.role === 'system')?.content || '';
    const user = body.messages.find((m) => m.role === 'user')?.content || '';
    if (sys.includes('maintain the skills')) {
      calls.reflect++;
      const m = /## (skillparseumr\/[^\n]*\.(?:md|py))\n```/.exec(user);
      return reply(route, 'final_result', { diagnosis: 'test diagnosis', layer: 'instructions',
        edits: [{ file: m ? m[1] : 'none', op: 'add', find: '', replace: '<!-- edit proposed by the test -->', why: 'test' }] });
    }
    calls.haiku++;
    calls.systems.add(sys);
    calls.inputs.push(body.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'));
    if (user.startsWith('# Output Format')) calls.heads++;
    const skill = /## Input/.test(user) ? 'agent' : '?';
    calls.skills.add(skill);
    const names = body.tools.map((t) => t.function.name);
    const used = body.messages.some((m) => m.role === 'tool');
    if (!used && names.includes('get_example')) {
      calls.tools.get_example = (calls.tools.get_example || 0) + 1;
      return reply(route, 'get_example', {});
    }
    if (used) {
      const res = body.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('');
      if (res.includes('"example"') && res.length > 200) calls.tools.exampleRead = true;
    }
    return reply(route, 'final_result', emitFor(body.tools.find((t) => t.function.name === 'final_result').function.parameters));
  }

  /** Haiku through the Anthropic API (the Messages API's tool_use blocks). */
  const anth = { calls: 0, models: new Set() };
  async function anthropic(route) {
    const body = JSON.parse(route.request().postData());
    anth.calls++;
    anth.models.add(body.model);
    const names = body.tools.map((x) => x.name);
    const used = body.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'));
    const use = (name, input) => route.fulfill({ json: { content: [{ type: 'tool_use', id: `t${Math.random()}`, name, input }], stop_reason: 'tool_use' } });
    if (!used && names.includes('get_example')) return use('get_example', {});
    return use('final_result', emitFor(body.tools.find((x) => x.name === 'final_result').input_schema));
  }

  return { calls, anth, systemone, chat, anthropic };
};
