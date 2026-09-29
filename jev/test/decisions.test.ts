import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decisions, chooseOption, decisionsConfig } from '../src/decisions.ts';

function stubFetch(response: unknown, ok = true, status = 200) {
  return (async () => ({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  })) as Parameters<typeof decisions>[1];
}

const choiceResponse = {
  model: 'typesafe/jev-1.13-20260917',
  provider: 'TypeSafe',
  id: 'gen-1',
  answers: {
    recipient: { type: 'choice', choice: '0xaaa', probabilities: { '0xaaa': 1, '0xbbb': 0 }, confidence: 1 },
  },
  usage: { input_tokens: 509, output_tokens: 148, cost: 0.000021 },
};

describe('jev decisions client', () => {
  it('posts model/state/questions to the decisions endpoint', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.JEV_DECISIONS_MODEL;
    delete process.env.JEV_DECISIONS_URL;
    let seenUrl = '';
    let seenBody: Record<string, unknown> = {};
    let seenAuth = '';
    const spy = (async (url, init) => {
      seenUrl = String(url);
      seenAuth = String(init?.headers?.authorization || '');
      seenBody = JSON.parse(String(init?.body || '{}'));
      return { ok: true, status: 200, json: async () => choiceResponse, text: async () => '{}' };
    }) as Parameters<typeof decisions>[1];
    const out = await decisions(
      { state: 'byline 0xaaa footer 0xbbb', questions: { recipient: { type: 'noul', instructions: 'x' } } },
      spy,
    );
    assert.equal(seenUrl, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(seenAuth, 'Bearer test-key');
    assert.equal(seenBody.model, '~typesafe/jev-latest');
    assert.deepEqual(seenBody.state, 'byline 0xaaa footer 0xbbb');
    assert.equal(out.model, 'typesafe/jev-1.13-20260917');
    assert.equal(out.usage?.cost, 0.000021);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('throws without a key', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(() => decisions({ state: 'x', questions: {} }, stubFetch({})), /missing OPENROUTER_API_KEY/);
  });

  it('chooseOption maps options to criteria and returns the pick', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    let seenBody: Record<string, unknown> = {};
    const spy = (async (_url, init) => {
      seenBody = JSON.parse(String(init?.body || '{}'));
      return { ok: true, status: 200, json: async () => choiceResponse, text: async () => '{}' };
    }) as Parameters<typeof chooseOption>[1];
    const out = await chooseOption(
      {
        state: 'External coffee blog; byline 0xaaa, footer 0xbbb',
        instructions: 'Pick the author wallet',
        questionId: 'recipient',
        options: [
          { id: '0xaaa', description: 'author byline' },
          { id: '0xbbb', description: 'footer link' },
        ],
      },
      spy,
    );
    const questions = seenBody.questions as Record<string, { type: string; criteria: Record<string, string> }>;
    assert.equal(questions.recipient.type, 'choice');
    assert.deepEqual(questions.recipient.criteria, { '0xaaa': 'author byline', '0xbbb': 'footer link' });
    assert.equal(out?.choice, '0xaaa');
    assert.equal(out?.confidence, 1);
    assert.equal(out?.model, 'typesafe/jev-1.13-20260917');
    delete process.env.OPENROUTER_API_KEY;
  });

  it('chooseOption returns null when the model invents an id', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const spy = stubFetch({
      model: 'm',
      answers: { choice: { type: 'choice', choice: '0xzzz', probabilities: {}, confidence: 1 } },
    });
    const out = await chooseOption(
      { state: 's', instructions: 'i', options: [{ id: '0xaaa', description: 'a' }] },
      spy,
    );
    assert.equal(out, null);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('chooseOption resolves checksummed ids case-insensitively', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const spy = stubFetch({
      model: 'm',
      answers: { choice: { type: 'choice', choice: '0xAAA', probabilities: { '0xAAA': 1 }, confidence: 0.9 } },
    });
    const out = await chooseOption(
      { state: 's', instructions: 'i', options: [{ id: '0xaaa', description: 'a' }, { id: '0xbbb', description: 'b' }] },
      spy,
    );
    assert.equal(out?.choice, '0xaaa');
    assert.equal(out?.probabilities['0xaaa'], 1);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('decisionsConfig honors overrides', () => {
    process.env.JEV_DECISIONS_MODEL = 'typesafe/jev-1.13';
    process.env.JEV_DECISIONS_URL = 'https://example.test/dec';
    const cfg = decisionsConfig();
    assert.equal(cfg.model, 'typesafe/jev-1.13');
    assert.equal(cfg.url, 'https://example.test/dec');
    delete process.env.JEV_DECISIONS_MODEL;
    delete process.env.JEV_DECISIONS_URL;
  });

  it('askNoul returns the calibrated probability', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const spy = stubFetch({
      model: 'm',
      answers: {
        isContent: { type: 'noul', noul: 0.83 },
        aboutCoffee: { type: 'noul', noul: 0.91 },
        aboutSports: { type: 'noul', noul: 0.04 },
        bogus: { type: 'noul', noul: 1.9 },
      },
    });
    {
      const { askNoul } = await import('../src/decisions.ts');
      const out = await askNoul({ state: 'a blog post about coffee', instructions: 'Is this a creator content page?', questionId: 'isContent' }, spy);
      assert.equal(out?.probability, 0.83);
    }
    {
      const { askNoulBatch } = await import('../src/decisions.ts');
      const out = await askNoulBatch(
        { state: 'a blog post about coffee', questions: [{ id: 'aboutCoffee', instructions: 'coffee?' }, { id: 'aboutSports', instructions: 'sports?' }, { id: 'bogus', instructions: 'clamp?' }] },
        spy,
      );
      assert.equal(out?.answers.aboutCoffee, 0.91);
      assert.equal(out?.answers.aboutSports, 0.04);
      assert.equal(out?.answers.bogus, 1); // clamped to 1
    }
    delete process.env.OPENROUTER_API_KEY;
  });

  it('askNoul returns null when the model omits the answer', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const spy = stubFetch({ model: 'm', answers: { other: { type: 'noul', noul: 0.5 } } });
    const { askNoul } = await import('../src/decisions.ts');
    assert.equal(await askNoul({ state: 's', instructions: 'i', questionId: 'wanted' }, spy), null);
    delete process.env.OPENROUTER_API_KEY;
  });
});
