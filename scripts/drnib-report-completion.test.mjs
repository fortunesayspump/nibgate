import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSection, generateAbstract } from '../dr-nib/backend/src/llm/generate.js';

process.env.OPENROUTER_API_KEY = 'offline-test-key';
process.env.LLM_FALLBACK_MODELS = '';
const response = (text, finishReason) => ({ ok: true, json: async () => ({
  model: 'test-model', choices: [{ message: { content: text }, finish_reason: finishReason }],
  usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.01 },
}) });

test('report sections retry incomplete output, reserve reasoning headroom and count every attempt', async () => {
  let calls = 0;
  const out = await generateSection({ brief: { topic: 'Fees' }, section: 'Fees', targetWords: 600, fetchImpl: async (_url, options) => {
    assert.equal(JSON.parse(options.body).max_tokens, 9392);
    return ++calls === 1 ? response('Unfinished drafting fragment', 'length') : response('## Fees\n\nThe supplied evidence does not establish exact fees.', 'stop');
  } });
  assert.equal(calls, 2);
  assert.equal(out.source, 'llm');
  assert.doesNotMatch(out.markdown, /drafting fragment/);
  assert.equal(out.usage.costUsd, 0.02);
});

test('exhausted incomplete sections remain explicit placeholders rather than fabricated reports', async () => {
  const out = await generateSection({ brief: { topic: 'Fees' }, section: 'Fees', fetchImpl: async () => response('Unfinished drafting fragment', 'length') });
  assert.equal(out.source, 'fallback');
  assert.match(out.markdown, /Section pending/);
  assert.doesNotMatch(out.markdown, /drafting fragment/);
  assert.equal(out.usage.costUsd, 0.03);
});

test('incomplete abstracts are omitted while preserving metered cost', async () => {
  const out = await generateAbstract({ brief: { topic: 'Fees' }, reportText: 'Evidence.', fetchImpl: async () => response('Incomplete abstract', 'length') });
  assert.equal(out.abstract, null);
  assert.equal(out.usage.costUsd, 0.01);
});
