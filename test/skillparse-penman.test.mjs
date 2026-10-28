// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';

import { outputPenman } from '../js/skillparse/penman-view.js';

test('a predicate fragment is Penman with <node: …> for the parts built later', () => {
  const out = outputPenman(
    'predicate',
    {
      graph: {
        nodes: [{ var: 'e', concept: 'sell-01', span: [9, 9] }],
        edges: [
          ['e', 'ARG0', 'x1'],
          ['e', 'ARG1', 'x2'],
        ],
        attrs: [],
      },
      open: [
        { var: 'x1', text: 'The old farmer', span: [1, 3] },
        { var: 'x2', text: 'his horses', span: [10, 11] },
      ],
      outside: [{ text: 'Pope', span: [2, 2], role: 'ARG2' }],
      alignment: [9, 9],
      frame: {},
      aspect: 'performance',
      modstr: 'full-affirmative',
      polarity: 'negative',
    },
    { text: 'sold his horses' },
  );
  assert.equal(
    out,
    [
      '(e / sell-01',
      '    :ARG0 <node: The old farmer>',
      '    :ARG1 <node: his horses>',
      '    :ARG2 <outside: Pope>',
      '    :aspect performance',
      '    :modal-strength full-affirmative',
      '    :polarity -)',
    ].join('\n'),
  );
  assert.ok(!/\[|span|alignment/.test(out));
});

test('nested nodes, re-entrancy and quoted constants', () => {
  const out = outputPenman('special_entity', {
    graph: {
      nodes: [
        { var: 'p', concept: 'person' },
        { var: 'n', concept: 'name' },
      ],
      edges: [
        ['p', 'name', 'n'],
        ['n', 'op1', '爱德蒙'],
        ['n', 'mod', 'p'],
      ],
      attrs: [['n', 'op2', 'Pope Jr']],
    },
    open: [],
    outside: [],
    alignment: [1, 2],
  });
  assert.equal(
    out,
    '(p / person\n    :name (n / name\n        :op1 爱德蒙\n        :mod p\n        :op2 "Pope Jr"))',
  );
});

test('discourse, sent_type and document outputs', () => {
  assert.equal(
    outputPenman('discourse', {
      relation: 'and',
      parts: [
        { text: 'A', role: 'op1' },
        { text: 'B', role: 'op2' },
      ],
    }),
    '(r / and\n    :op1 <node: A>\n    :op2 <node: B>)',
  );
  assert.equal(
    outputPenman('sent_type', { type: 'predicate', graph: {}, outside: [] }, { text: '他来了' }),
    '# predicate → <node: 他来了>',
  );
  assert.equal(
    outputPenman('document', {
      relations: [
        { group: 'temporal', source: 'document-creation-time', relation: 'before', target: 's1e' },
        { group: 'modal', source: 'author', relation: 'full-affirmative', target: 's1e' },
      ],
    }),
    '(sentence\n    :temporal ((document-creation-time :before s1e))\n    :modal ((author :full-affirmative s1e)))',
  );
  assert.equal(outputPenman('x', { whatever: 1 }), null);
});
