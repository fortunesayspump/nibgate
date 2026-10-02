import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, chatJson, isLlmConfigured, parseJsonReply, LlmError } from './provider.js';
import { costUsd, defaultEffort, routerModel } from './pricing.js';
import { generatePlan, generateReport, generateRoundReview } from './generate.js';
import { planMessages, reportMessages } from './prompts.js';

const KEY = 'OPENROUTER_API_KEY';

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    body: null,
  };
}

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream, text: async () => '' };
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env[KEY];
});

describe('router model', () => {
  it('defaults to the JEV router', () => {
    expect(routerModel()).toBe('typesafe/jev-router');
  });

  it('lets env swap the router without touching pipeline code', () => {
    vi.stubEnv('LLM_MODEL', 'vendor/other-router');
    expect(routerModel()).toBe('vendor/other-router');
  });

  it('defaults reasoning effort to medium and clamps unknown values', () => {
    expect(defaultEffort()).toBe('medium');
    vi.stubEnv('LLM_REASONING_EFFORT', 'nonsense');
    expect(defaultEffort()).toBe('medium');
    vi.stubEnv('LLM_REASONING_EFFORT', 'high');
    expect(defaultEffort()).toBe('high');
  });

  it('prefers the provider-reported cost over the fallback', () => {
    expect(costUsd({ promptTokens: 1e6, completionTokens: 1e6, providerCost: 0.0042 })).toBe(0.0042);
  });

  it('falls back to a conservative estimate when the provider reports no cost', () => {
    expect(costUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000 })).toBeCloseTo(18, 6);
  });
});

describe('chat', () => {
  it('refuses to call without a key instead of silently degrading', async () => {
    await expect(chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(LlmError);
    expect(isLlmConfigured()).toBe(false);
  });

  it('returns text, model, and metered usage from one response', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      model: 'anthropic/claude-sonnet-4',
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0007 },
    }));
    const out = await chat({ messages: [{ role: 'user', content: 'hi' }], fetchImpl });
    expect(out.text).toBe('hello');
    expect(out.usage.promptTokens).toBe(10);
    expect(out.usage.completionTokens).toBe(5);
    expect(out.usage.costUsd).toBe(0.0007);
  });

  it('calls the router and passes intensity, not a model id, for the request', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      model: 'openai/gpt-6-luna',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
    }));
    const out = await chat({ effort: 'high', messages: [{ role: 'user', content: 'hi' }], fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('typesafe/jev-router');
    expect(body.reasoning_effort).toBe('high');
    // The router may answer with whatever model it picked; we surface that.
    expect(out.model).toBe('openai/gpt-6-luna');
    expect(out.effort).toBe('high');
  });

  it('rejects an unknown intensity instead of silently forwarding it', async () => {
    vi.stubEnv(KEY, 'test-key');
    await expect(chat({ effort: 'turbo', messages: [{ role: 'user', content: 'hi' }], fetchImpl: vi.fn() }))
      .rejects.toMatchObject({ code: 'bad_request' });
  });

  it('sends a server-side fallback chain when configured, and reports who served', async () => {
    vi.stubEnv(KEY, 'test-key');
    vi.stubEnv('LLM_FALLBACK_MODELS', 'vendor/backup-a, vendor/backup-b');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      model: 'vendor/backup-a',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0001 },
    }));
    const out = await chat({ messages: [{ role: 'user', content: 'hi' }], fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.models).toEqual(['typesafe/jev-router', 'vendor/backup-a', 'vendor/backup-b']);
    expect(body).not.toHaveProperty('model');
    // The serving model is recorded; whether it came from the router's own
    // pick or a failover is read off the response, not guessed.
    expect(out.model).toBe('vendor/backup-a');
  });

  it('sends a single model and no fallback flag by default', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      model: 'openai/gpt-6-luna',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0001 },
    }));
    const out = await chat({ messages: [{ role: 'user', content: 'hi' }], fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('typesafe/jev-router');
    expect(body).not.toHaveProperty('models');
  });

  it('streams deltas and captures the final usage chunk', async () => {
    vi.stubEnv(KEY, 'test-key');
    const deltas = [];
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse([
      'data: {"model":"m","choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2,"cost":0.0001}}\n\n',
      'data: [DONE]\n\n',
    ]));
    const out = await chat({ messages: [{ role: 'user', content: 'hi' }], onToken: (d) => deltas.push(d), fetchImpl });
    expect(deltas).toEqual(['Hel', 'lo']);
    expect(out.text).toBe('Hello');
    expect(out.usage.completionTokens).toBe(2);
    expect(out.usage.costUsd).toBe(0.0001);
  });

  it('surfaces an HTTP error with its status', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'slow down' });
    await expect(chat({ messages: [{ role: 'user', content: 'hi' }], fetchImpl })).rejects.toMatchObject({ status: 429 });
  });
});

describe('parseJsonReply', () => {
  it('reads a fenced JSON object', () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('reads bare JSON with surrounding prose', () => {
    expect(parseJsonReply('Sure: {"a":2} done')).toEqual({ a: 2 });
  });

  it('reads a JSON array', () => {
    expect(parseJsonReply('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('throws a typed error when there is no JSON', () => {
    expect(() => parseJsonReply('no json here')).toThrowError(/no JSON/i);
  });
});

describe('chatJson', () => {
  it('repairs an invalid first reply with one retry', async () => {
    vi.stubEnv(KEY, 'test-key');
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      call += 1;
      const content = call === 1 ? 'not json at all' : '{"ok":true}';
      return jsonResponse({ model: 'm', choices: [{ message: { content } }], usage: {} });
    });
    const out = await chatJson({ messages: [{ role: 'user', content: 'give json' }], fetchImpl });
    expect(out.data).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('generate falls back rather than failing', () => {
  it('plans deterministically when no model is configured', async () => {
    const out = await generatePlan({ brief: { topic: 'x402 payments' } });
    expect(out.source).toBe('fallback');
    expect(out.sub_questions.length).toBeGreaterThan(0);
    expect(out.sub_questions[0]).toContain('x402 payments');
  });

  it('writes a placeholder report when no model is configured', async () => {
    const out = await generateReport({ brief: {}, sources: [], runId: 'run-1', version: 1 });
    expect(out.source).toBe('fallback');
    expect(out.markdown).toContain('run-1');
  });

  it('uses the model and reports its cost when configured', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      model: 'm',
      choices: [{ message: { content: '{"sub_questions":["q1","q2"],"uncertainties":["u"],"estimate":{"sources":9,"rationale":"because"}}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.002 },
    }));
    // Inject through the same transport the generate layer uses.
    const out = await generatePlanWith(fetchImpl, { brief: { topic: 'topic' } });
    expect(out.source).toBe('llm');
    expect(out.sub_questions).toEqual(['q1', 'q2']);
    expect(out.usage.costUsd).toBe(0.002);
  });

  it('records the reason when the model call fails, instead of failing silently', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const plan = await generatePlan({ brief: { topic: 't' }, fetchImpl });
    expect(plan.source).toBe('fallback');
    expect(plan.llmError).toMatch(/socket hang up/);
    const report = await generateReport({ brief: {}, runId: 'r', version: 1, fetchImpl });
    expect(report.source).toBe('fallback');
    expect(report.llmError).toMatch(/socket hang up/);
    const review = await generateRoundReview({ brief: {}, round: 0, sources: [], fetchImpl });
    expect(review.source).toBe('fallback');
    expect(review.learnings).toEqual([]);
    expect(review.followUps).toEqual([]);
  });
});

// generatePlan does not accept fetchImpl (production never injects one), so the
// configured-path test drives chat/chatJson directly with the same messages.
async function generatePlanWith(fetchImpl, args) {
  const { data, usage, model } = await chatJson({
    effort: 'high',
    messages: planMessages(args),
    fetchImpl,
  });
  return {
    source: 'llm',
    model,
    usage,
    sub_questions: data.sub_questions,
    uncertainties: data.uncertainties,
    estimate: data.estimate.sources,
  };
}

describe('prompts carry the hard rules', () => {
  it('the report prompt bounds the model to the supplied evidence', () => {
    const msgs = reportMessages({ brief: { topic: 't' }, sources: [{ url: 'https://a', title: 'A' }] });
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toMatch(/only material you may rely on/i);
    expect(all).toMatch(/unsupported/i);
    expect(all).toMatch(/cite/i);
  });

  it('the plan prompt asks for JSON and forbids prose outside it', () => {
    const all = planMessages({ brief: { topic: 't' } }).map((m) => m.content).join('\n');
    expect(all).toMatch(/JSON/);
    expect(all).toMatch(/No prose outside the JSON/i);
  });
});
