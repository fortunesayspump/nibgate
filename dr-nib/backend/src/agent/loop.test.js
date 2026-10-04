import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../llm/provider.js', () => ({ isLlmConfigured: () => true, chatJson: vi.fn() }));
vi.mock('../jev/client.js', () => ({ decide: vi.fn(), JevUnavailable: class JevUnavailable extends Error {} }));
vi.mock('../tools/executor.js', () => ({
  toolSpecs: () => [
    { name: 'web_search', cost: 'metered', description: 'search' },
    { name: 'tip_creator', cost: 'onchain', description: 'tip' },
  ],
  runTool: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

import { chatJson } from '../llm/provider.js';
import { decide } from '../jev/client.js';
import { runTool } from '../tools/executor.js';
import { proposeTool, judgeToolCall, runToolAgent } from './loop.js';

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
    vi.mocked(chatJson).mockResolvedValue({ data: { tool: 'tip_creator', input: {}, why: 'generous' } });
    vi.mocked(decide).mockResolvedValue({ pick: 'skip', probabilities: { skip: 0.8 }, model: 't' });
    const out = await runToolAgent({ task: 'tip things', maxSteps: 1 });
    expect(vi.mocked(runTool)).not.toHaveBeenCalled();
    expect(out.steps[0].result.skipped).toBe(true);
    expect(out.stopped).toBe('max-steps');
  });

  it('JEV outage degrades to skip, never blind execution', async () => {
    const { JevUnavailable } = await import('../jev/client.js');
    vi.mocked(chatJson).mockResolvedValue({ data: { tool: 'web_search', input: {}, why: 'x' } });
    vi.mocked(decide).mockRejectedValue(new JevUnavailable('down'));
    const out = await runToolAgent({ task: 't', maxSteps: 1 });
    expect(vi.mocked(runTool)).not.toHaveBeenCalled();
    expect(out.steps[0].judgement.source).toBe('fallback');
  });
});
