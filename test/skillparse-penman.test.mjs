// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';

import { outputPenman, docNodes } from '../js/skillparse/penman-view.js';

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

test("a document step's node ids are written as the words and concepts they stand for", () => {
  const tree = (s, extra) => ({
    nodes: [
      { id: '0', skill: 'sent_type', input: { text: s }, graph: {} },
      {
        id: '0.0',
        skill: 'predicate',
        input: { text: s },
        graph: { nodes: [{ var: 'e', concept: '拥有-01', span: [4, 5] }] },
      },
      ...extra,
    ],
  });
  const input = {
    sents: [
      { index: 2, text: '该周报综合了新闻。', tokenized_text: [...'该周报综合了新闻。'] },
      { index: 3, text: '该周报拥有节目。', tokenized_text: [...'该周报拥有节目。'] },
    ],
    trees: [
      tree('该周报综合了新闻。', [
        {
          id: '0.0.0',
          skill: 'np_phrase',
          input: { text: '该周报' },
          graph: { nodes: [{ var: 'n', concept: '周报', span: [0, 0] }] },
        },
      ]),
      tree('该周报拥有节目。', [
        {
          id: '0.0.0',
          skill: 'np_phrase',
          input: { text: '该周报' },
          graph: {
            nodes: [
              { var: 'p', concept: 'newspaper', span: [2, 3] },
              { var: 'd', concept: '该', span: [1, 1] },
            ],
          },
        },
      ]),
    ],
  };
  const out = outputPenman(
    'document',
    {
      relations: [
        {
          group: 'temporal',
          source: 'document-creation-time',
          relation: 'before',
          target: '3:0.0',
        },
        { group: 'coref', source: '2:0.0.0', relation: 'same-entity', target: '3:0.0.0/p' },
        { group: 'coref', source: '3:0.0.0/d', relation: 'same-entity', target: '3:9.9' },
      ],
    },
    input,
  );
  assert.equal(
    out,
    [
      '(sentence',
      '    :temporal ((document-creation-time :before <node: 拥有 / 拥有-01>))',
      '    :coref ((<node: s2 该周报 / 周报> :same-entity <node: 周报 / newspaper>)',
      '            (<node: 该> :same-entity <node: ? 3:9.9>)))',
    ].join('\n'),
  );
  assert.deepEqual(
    docNodes(input).map((n) => [n.ref, n.current, n.label]),
    [
      ['2:0.0', false, '综合 / 拥有-01'],
      ['2:0.0.0', false, '该周报 / 周报'],
      ['3:0.0', true, '拥有 / 拥有-01'],
      ['3:0.0.0', true, '周报 / newspaper'],
      ['3:0.0.0/d', true, '该'],
    ],
  );
});
