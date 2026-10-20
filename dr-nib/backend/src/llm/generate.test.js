import { afterEach, describe, expect, it, vi } from 'vitest';
import { abstractMessages, generateReport, generateSection } from './generate.js';
import { reportMessages } from './prompts.js';
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

describe('short report reliability', () => {
  it('gives the abstract writer the conclusion after a long body', () => {
    const report = `## Analysis\n${'Evidence and calculations. '.repeat(450)}\n## Conclusion\nThe reconciliation is complete.`;
    const prompt = abstractMessages({ brief: { topic: 'expenses' }, reportText: report })[1].content;
    expect(prompt).toContain('The reconciliation is complete.');
    expect(prompt).toContain('Do not describe a section as missing');
  });

  it('retries a transient writing failure and produces a real report', async () => {
    vi.stubEnv(KEY, 'test-key');
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('temporary writer outage'))
      .mockResolvedValue(jsonResponse('# Findings\n\nThe evidence supports a limited conclusion [1].'));
    const out = await generateReport({ brief: { topic: 'fees' }, sources: [{ title: 'Official fees', url: 'https://example.org/fees', excerpt: 'Documented fees.' }], targetWords: 300, fetchImpl });
    expect(out.source).toBe('llm');
    expect(out.markdown).toContain('The evidence supports');
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('bounds the evidence context while keeping all citation numbers', () => {
    const sources = Array.from({ length: 15 }, (_, i) => ({ citationIndex: i + 1, url: `https://example.org/${i}`, excerpt: 'x'.repeat(6000) }));
    const prompt = reportMessages({ brief: { topic: 'fees' }, sources, targetWords: 900 })[1].content;
    expect(prompt.length).toBeLessThan(35000);
    expect(prompt).toContain('[15]');
  });
});

describe('report length floor', () => {
  const brief = { topic: 'fees', lengthWords: 4000 };
  const evidence = [
    { url: 'https://a.example/1', title: 'One', excerpt: 'Arc charges a flat fee for transfers.' },
    { url: 'https://b.example/2', title: 'Two', excerpt: 'Base finality takes minutes on L1.' },
  ];
  const getEvidence = async () => evidence;

  it('deepens short sections until the floor is met', async () => {
    vi.stubEnv(KEY, 'test-key');
    const { generateReportLong } = await import('./generate.js');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse('Intro words here.'))
      .mockResolvedValueOnce(jsonResponse('## Q1\n\nShort one.'))
      .mockResolvedValueOnce(jsonResponse('## Q2\n\nShort two.'))
      .mockResolvedValue(jsonResponse('Extended with numbers and mechanisms. Cited [1].'));
    const out = await generateReportLong({
      brief, sections: ['Q1', 'Q2'], getEvidence, runId: 'r1', version: 1, fetchImpl,
    });
    // intro + 2 sections + ≥1 deepening pass + conclusion
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(out.markdown).toContain('Short one.');
    expect(out.markdown).toContain('Extended with numbers');
  }, 20000);

  it('stops deepening when the evidence is spent (NOTHING_NEW)', async () => {
    vi.stubEnv(KEY, 'test-key');
    const { generateReportLong } = await import('./generate.js');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse('Intro words here.'))
      .mockResolvedValueOnce(jsonResponse('## Q1\n\nShort one.'))
      .mockResolvedValueOnce(jsonResponse('## Q2\n\nShort two.'))
      .mockResolvedValueOnce(jsonResponse('NOTHING_NEW'))
      .mockResolvedValue(jsonResponse('## Conclusion\n\nDone here.'));
    const out = await generateReportLong({
      brief, sections: ['Q1', 'Q2'], getEvidence, runId: 'r1', version: 1, fetchImpl,
    });
    // intro + 2 sections + exactly 1 deepening attempt + conclusion + abstract
    expect(fetchImpl.mock.calls.length).toBe(6);
    expect(out.markdown).toContain('Short two.');
    expect(out.markdown).not.toContain('NOTHING_NEW');
  }, 20000);

  it('counts prose words, not markup', async () => {
    const { countWords } = await import('../length.js');
    expect(countWords('## Title\n\nHello world, this is **bold** text.')).toBe(7);
    expect(countWords('See [the docs](https://a.example/x) for [1] details.')).toBe(6);
    expect(countWords('```js\nconst x = 1;\n```\nReal words here.')).toBe(3);
  });

  it('sizes the plan outline to the length floor', async () => {
    vi.stubEnv(KEY, 'test-key');
    const { generatePlan } = await import('./generate.js');
    const plan = {
      sub_questions: ['a', 'b', 'c', 'd'],
      uncertainties: ['u'], estimate: { sources: 3, rationale: 'r' },
    };
    const pFetch = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify(plan)));
    const out = await generatePlan({ brief, fetchImpl: pFetch });
    expect(out.sub_questions).toHaveLength(4);
    const sent = JSON.parse(pFetch.mock.calls[0][1].body);
    const prompt = sent.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('at least 4 sub-questions');
    expect(prompt).toContain('4000 words');
  }, 15000);
});

describe('model split (cheap bulk, smart judgement)', () => {
  it('defaults judgement to the chat router, never the decisions router', async () => {
    // typesafe/jev-router is a decisions router: sent with the `models`
    // fallback array OpenRouter 400s the whole request, which silently
    // banked every intake and plan on prod. The smart default must be a
    // chat-completions model.
    expect(routerModel()).toBe('typesafe/jev-router');
    expect(smartModel()).toBe('typesafe/jev-router');
    vi.stubEnv('LLM_MODEL', '~google/gemini-flash-latest');
    vi.stubEnv('LLM_SMART_MODEL', 'typesafe/jev-router');
    expect(routerModel()).toBe('~google/gemini-flash-latest');
    expect(smartModel()).toBe('typesafe/jev-router');
    vi.stubEnv('LLM_SMART_MODEL', '');
    expect(smartModel()).toBe('~google/gemini-flash-latest');
  });

  it('routes intake questions to the smart model, sections to the cheap one', async () => {
    vi.stubEnv(KEY, 'test-key');
    vi.stubEnv('LLM_MODEL', '~google/gemini-flash-latest');
    vi.stubEnv('LLM_SMART_MODEL', '');
    const { generateIntakeQuestion } = await import('./generate.js');
    const qFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ type: 'pick_one', prompt: 'Which depth fits this question best?', key: 'depth', options: [{ id: 'a', label: 'Quick' }] }) } }] }),
      text: async () => '', body: null,
    });
    await generateIntakeQuestion({ topic: 'fees', fetchImpl: qFetch });
    expect(JSON.parse(qFetch.mock.calls[0][1].body).model).toBe('~google/gemini-flash-latest');
    const sFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'body text' } }], usage: {} }),
      text: async () => '', body: null,
    });
    await generateSection({ ...ARGS, fetchImpl: sFetch });
    expect(JSON.parse(sFetch.mock.calls[0][1].body).model).toBe('~google/gemini-flash-latest');
  });
});


describe('concise private deliverables',()=>{
 it('omits the separate abstract call when the concise writer requests body only',async()=>{
  vi.stubEnv(KEY,'test-key');
  const fetchImpl=vi.fn().mockResolvedValue(jsonResponse('# Findings\n\n'+'A supported observation [1]. '.repeat(80)));
  const out=await generateReport({brief:{topic:'concise',qualityPolicyVersion:2},sources:[{title:'Original',url:'https://example.org',excerpt:'An observation.'}],targetWords:300,includeAbstract:false,fetchImpl});
  expect(out.source).toBe('llm');expect(fetchImpl).toHaveBeenCalledTimes(1);expect(out.markdown).not.toContain('Abstract.');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).messages[1].content).toContain('about 300 words');
 });
});
