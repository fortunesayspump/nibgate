import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSection } from './generate.js';
import { routerModel, smartModel } from './pricing.js';

const KEY = 'OPENROUTER_API_KEY';

function jsonResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: 'test/model',
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0 },
    }),
    text: async () => '',
    body: null,
  };
}

const ARGS = { brief: { topic: 'fees' }, section: 'Fees', index: 0, of: 1, sources: [] };

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env[KEY];
});

describe('generateSection retry', () => {
  it('recovers when early attempts come back empty', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(''))
      .mockResolvedValueOnce(jsonResponse('   '))
      .mockResolvedValueOnce(jsonResponse('## Fees\n\nReal section text.'));
    const out = await generateSection({ ...ARGS, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out.source).toBe('llm');
    expect(out.markdown).toContain('Real section text.');
  }, 15000);

  it('falls back only after all attempts come back empty', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(''));
    const out = await generateSection({ ...ARGS, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out.source).toBe('fallback');
    expect(out.llmError).toContain('attempt 3/3');
    expect(out.markdown).toContain('[Section pending');
  }, 15000);

  it('retries through transport errors, not just empty text', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(jsonResponse('## Fees\n\nRecovered.'));
    const out = await generateSection({ ...ARGS, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.source).toBe('llm');
  }, 15000);

  it('falls back immediately when the LLM is not configured', async () => {
    const fetchImpl = vi.fn();
    const out = await generateSection({ ...ARGS, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.source).toBe('fallback');
  });
});

describe('model split (cheap bulk, smart judgement)', () => {
  it('defaults bulk writing to LLM_MODEL and judgement to the router', async () => {
    expect(routerModel()).toBe('typesafe/jev-router');
    expect(smartModel()).toBe('typesafe/jev-router');
    vi.stubEnv('LLM_MODEL', '~google/gemini-flash-latest');
    vi.stubEnv('LLM_SMART_MODEL', 'typesafe/jev-router');
    expect(routerModel()).toBe('~google/gemini-flash-latest');
    expect(smartModel()).toBe('typesafe/jev-router');
  });

  it('routes intake questions to the smart model, sections to the cheap one', async () => {
    vi.stubEnv(KEY, 'test-key');
    vi.stubEnv('LLM_MODEL', '~google/gemini-flash-latest');
    const { generateIntakeQuestion } = await import('./generate.js');
    const qFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ type: 'pick_one', prompt: 'Which depth fits this question best?', key: 'depth', options: [{ id: 'a', label: 'Quick' }] }) } }] }),
      text: async () => '', body: null,
    });
    await generateIntakeQuestion({ topic: 'fees', fetchImpl: qFetch });
    expect(JSON.parse(qFetch.mock.calls[0][1].body).model).toBe('typesafe/jev-router');
    const sFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'body text' } }], usage: {} }),
      text: async () => '', body: null,
    });
    await generateSection({ ...ARGS, fetchImpl: sFetch });
    expect(JSON.parse(sFetch.mock.calls[0][1].body).model).toBe('~google/gemini-flash-latest');
  });
});
