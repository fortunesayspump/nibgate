import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { propose } from '../src/propose.ts';

function stubFetch(response: unknown, ok = true, status = 200) {
  return (async () => ({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  })) as Parameters<typeof propose>[1];
}

const req = {
  task: 'Pick sources worth paying for',
  candidates: [
    { id: 'a', kind: 'unlock', cost: 0.2, context: 'Primary source, paywalled' },
    { id: 'b', kind: 'skip', cost: 0, context: 'Blog recap' },
  ],
  signals: ['relevance', 'confidence'],
};

describe('propose', () => {
  it('parses scored options, drops invented ids, clamps scores', async () => {
    process.env.JEV_LLM_PROVIDER = 'vercel';
    process.env.AI_GATEWAY_API_KEY = 'test-key';
    const r = await propose(
      req,
      stubFetch({
        choices: [{ message: { content: '{"options":[{"id":"a","scores":{"relevance":0.9,"confidence":1.4}},{"id":"zzz","scores":{"relevance":1}}]}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    assert.equal(r.options.length, 1);
    assert.equal(r.options[0].id, 'a');
    assert.equal(r.options[0].scores.confidence, 1); // clamped
    assert.equal(r.usage?.promptTokens, 10);
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it('throws without an API key', async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(() => propose(req, stubFetch({})), /missing API key/);
  });

  it('throws on empty usable options', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key';
    await assert.rejects(
      () => propose(req, stubFetch({ choices: [{ message: { content: '{"options":[]}' } }] })),
      /no usable options/,
    );
    delete process.env.AI_GATEWAY_API_KEY;
  });
});
