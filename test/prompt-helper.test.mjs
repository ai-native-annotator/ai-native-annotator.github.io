// @ts-check

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { promptOf } = require('../docs/verification/_prompt.js');

test('promptOf joins Anthropic cacheable system blocks and messages', () => {
  const prompt = promptOf({
    system: [{ text: 'skill instructions' }, { text: 'language overlay' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'annotate this' }] }],
  });

  assert.match(prompt, /skill instructions\nlanguage overlay/);
  assert.match(prompt, /annotate this/);
});

test('promptOf reads OpenAI system and user messages', () => {
  const prompt = promptOf(
    JSON.stringify({
      messages: [
        { role: 'system', content: 'skill instructions' },
        { role: 'user', content: 'annotate this' },
      ],
    }),
  );

  assert.match(prompt, /skill instructions/);
  assert.match(prompt, /annotate this/);
});
