// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';

import { jsonText, stable } from '../js/skillparse/diff.js';

test('an object is one key per line; everything inside [] stays on one line', () => {
  const out = {
    graph: {
      nodes: [{ var: 'e', concept: 'sell-01', span: [9, 9] }],
      edges: [['e', 'ARG0', 'x1']],
      attrs: [],
    },
    open: [{ var: 'x1', text: 'the farmer', span: [1, 3] }],
    frame: {},
    aspect: 'performance',
  };
  assert.equal(
    jsonText(out),
    [
      '{',
      '  "graph": {',
      '    "nodes": [{"var": "e", "concept": "sell-01", "span": [9, 9]}],',
      '    "edges": [["e", "ARG0", "x1"]],',
      '    "attrs": []',
      '  },',
      '  "open": [{"var": "x1", "text": "the farmer", "span": [1, 3]}],',
      '  "frame": {},',
      '  "aspect": "performance"',
      '}',
    ].join('\n'),
  );
  assert.deepEqual(JSON.parse(jsonText(out)), out);
  assert.equal(stable({ b: [2, 1], a: null }), '{\n  "a": null,\n  "b": [2, 1]\n}');
  assert.equal(jsonText([1, 'x']), '[1, "x"]');
});
