import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../llm/provider.js', () => ({ isLlmConfigured: () => true, chatJson: vi.fn(), chat: vi.fn() }));
vi.mock('../jev/client.js', () => ({ decide: vi.fn(), JevUnavailable: class JevUnavailable extends Error {} }));
vi.mock('../tools/executor.js', () => ({
  toolSpecs: () => [
    { name: 'web_search', cost: 'metered', description: 'search' },
    { name: 'tip_creator', cost: 'onchain', description: 'tip' },
  ],
  runTool: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

import { chatJson, chat } from '../llm/provider.js';
import { decide } from '../jev/client.js';
import { runTool } from '../tools/executor.js';
import { proposeTool, judgeToolCall, runToolAgent } from './loop.js';
import { fingerprint, similarity, coverage } from './stops.js';

// No evidence checklist unless a test opts in (extractor returns nothing).
beforeEach(() => vi.mocked(chat).mockResolvedValue({ text: '' }));

describe('tool agent loop', () => {
  it('proposes, judges execute, runs, and answers', async () => {
    vi.mocked(chatJson)
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'x' }, why: 'need sources' } })
      .mockResolvedValueOnce({ data: { done: true, answer: 'found it' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'execute', probabilities: { execute: 0.9 }, model: 't' });
    vi.mocked(runTool).mockResolvedValue({ ok: true, output: { results: [] }, costUsd: 0.01 });
    const out = await runToolAgent({ task: 'find x', maxSteps: 4 });
    expect(out.answer).toBe('found it');
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].judgement).toMatchObject({ decision: 'execute', source: 'jev' });
    expect(out.steps[0].result.costUsd).toBe(0.01);
  });

  it('a skip never executes', async () => {
    vi.mocked(chatJson).mockResolvedValue({ data: { tool: 'tip_creator', input: { contentUrl: 'https://x.example/a', amount: 1 }, why: 'generous' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'skip', probabilities: { skip: 0.8 }, model: 't' });
    const out = await runToolAgent({ task: 'tip things', maxSteps: 1 });
    expect(vi.mocked(runTool)).not.toHaveBeenCalled();
    expect(out.steps[0].result.skipped).toBe(true);
    expect(out.stopped).toBe('max-steps');
  });

  it('JEV outage degrades to skip, never blind execution', async () => {
    const { JevUnavailable } = await import('../jev/client.js');
    vi.mocked(chatJson).mockResolvedValue({ data: { tool: 'web_search', input: { query: 'x' }, why: 'x' } });
    vi.mocked(decide).mockRejectedValue(new JevUnavailable('down'));
    const out = await runToolAgent({ task: 't', maxSteps: 1 });
    expect(vi.mocked(runTool)).not.toHaveBeenCalled();
    expect(out.steps[0].judgement.source).toBe('fallback');
  });

  it('first-turn judge silence stops the run instead of limping judgeless', async () => {
    const { JevUnavailable } = await import('../jev/client.js');
    vi.mocked(chatJson).mockResolvedValue({ data: { tool: 'web_search', input: { query: 'x' }, why: 'x' } });
    vi.mocked(decide).mockRejectedValue(new JevUnavailable('connection refused'));
    const out = await runToolAgent({ task: 't', maxSteps: 8 });
    expect(vi.mocked(runTool)).not.toHaveBeenCalled();
    expect(out.stopped).toBe('judge-unreachable');
    expect(out.steps).toHaveLength(1);
  });

  it('canonical fingerprints catch key-reordered duplicates', () => {
    expect(fingerprint('web_search', { a: 1, b: 2 })).toBe(fingerprint('web_search', { b: 2, a: 1 }));
  });

  it('an identical successful call stops as executed-duplicate', async () => {
    vi.mocked(chatJson)
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'x' }, why: 'x' } })
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'x' }, why: 'again' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'execute', probabilities: { execute: 0.9 }, model: 't' });
    vi.mocked(runTool).mockResolvedValue({ ok: true, output: 'first result text', costUsd: 0 });
    const out = await runToolAgent({ task: 't', maxSteps: 4 });
    expect(vi.mocked(runTool)).toHaveBeenCalledTimes(1);
    expect(out.stopped).toBe('executed-duplicate');
  });

  it('consecutive failures trip the failure budget', async () => {
    vi.mocked(chatJson).mockResolvedValue({ data: { tool: 'web_search', input: { query: 'x' }, why: 'x' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'execute', probabilities: { execute: 0.9 }, model: 't' });
    vi.mocked(runTool).mockResolvedValue({ ok: false, error: 'boom', costUsd: 0 });
    const out = await runToolAgent({ task: 't', maxSteps: 6, failBudget: 3 });
    expect(vi.mocked(runTool)).toHaveBeenCalledTimes(3);
    expect(out.stopped).toBe('failure-budget');
  });

  it('a covered checklist stops as evidence-covered', async () => {
    vi.mocked(chat).mockResolvedValue({ text: 'alpha beta gamma\n\nepsilon zeta' });
    vi.mocked(chatJson)
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q1' }, why: 'x' } })
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q2' }, why: 'x' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'execute', probabilities: { execute: 0.9 }, model: 't' });
    vi.mocked(runTool)
      .mockResolvedValueOnce({ ok: true, output: 'alpha and beta observed here', costUsd: 0 })
      .mockResolvedValueOnce({ ok: true, output: 'epsilon confirmed', costUsd: 0 });
    const out = await runToolAgent({ task: 't', maxSteps: 6 });
    expect(out.stopped).toBe('evidence-covered');
    expect(out.steps.filter((s) => s.result?.ok)).toHaveLength(2);
  });

  it('repeated identical observations stop as no-novelty', async () => {
    vi.mocked(chatJson)
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q1' }, why: 'x' } })
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q2' }, why: 'x' } })
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q3' }, why: 'x' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'execute', probabilities: { execute: 0.9 }, model: 't' });
    vi.mocked(runTool).mockResolvedValue({ ok: true, output: 'the same river water quality report text here', costUsd: 0 });
    const out = await runToolAgent({ task: 't', maxSteps: 6 });
    expect(out.stopped).toBe('no-novelty');
    expect(vi.mocked(runTool)).toHaveBeenCalledTimes(3);
  });

  it('an answer verdict synthesizes from history instead of returning empty', async () => {
    vi.mocked(chatJson)
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q1' }, why: 'x' } })
      .mockResolvedValueOnce({ data: { tool: 'web_search', input: { query: 'q2' }, why: 'x' } })
      .mockResolvedValueOnce({ data: { done: true, answer: 'synthesized finale' } });
    vi.mocked(decide)
      .mockResolvedValueOnce({ pick: 'execute', probabilities: { execute: 0.9 }, model: 't' })
      .mockResolvedValueOnce({ pick: 'answer', probabilities: { answer: 0.9 }, model: 't' });
    vi.mocked(runTool).mockResolvedValue({ ok: true, output: 'some evidence', costUsd: 0 });
    const out = await runToolAgent({ task: 't', maxSteps: 6 });
    expect(out.stopped).toBe('judge-answered');
    expect(out.answer).toBe('synthesized finale');
  });

  it('similarity and coverage helpers behave', () => {
    expect(similarity('the quick brown fox jumps', 'the quick brown fox jumps')).toBe(1);
    expect(similarity('alpha beta gamma delta', 'nothing shared here at all')).toBeLessThan(0.3);
    const cov = coverage(['alpha beta gamma delta', 'epsilon zeta'], ['alpha beta observed', 'epsilon confirmed']);
    expect(cov.missing).toEqual([]);
  });
});
