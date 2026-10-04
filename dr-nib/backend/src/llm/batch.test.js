import { describe, expect, it, vi } from 'vitest';

vi.mock('./provider.js', () => ({
  isLlmConfigured: () => true,
  chatJson: vi.fn(),
}));

import { chatJson } from './provider.js';
import { generateIntakeBatch } from './generate.js';
import { intakeBatchMessages } from './prompts.js';

describe('intake batch prompts', () => {
  it('asks for N questions, easiest first, without restating the topic', () => {
    const [, user] = intakeBatchMessages({ topic: 'newsletter paywalls that convert', answered: [], count: 5 });
    expect(user.content).toMatch(/5 next questions/);
    expect(user.content).toMatch(/easiest-first/);
    expect(user.content).toMatch(/NEVER restate/);
  });

  it('carries the rejected angle on reframe', () => {
    const [, user] = intakeBatchMessages({
      topic: 't', answered: [], count: 3,
      reframe: { rejected: ['Which outcome matters?'], reason: 'wrong angle' },
    });
    expect(user.content).toMatch(/COMPLETELY different/);
    expect(user.content).toMatch(/Which outcome matters\?/);
  });
});

describe('generateIntakeBatch', () => {
  it('validates every candidate and drops repeats inside the batch', async () => {
    vi.mocked(chatJson).mockResolvedValue({
      data: {
        questions: [
          { key: 'a', type: 'pick_one', prompt: 'Which single outcome decides it?', options: [{ id: 'x', label: 'Conversion' }, { id: 'y', label: 'Retention' }] },
          { key: 'b', type: 'pick_one', prompt: 'Which single outcome decides the winner?', options: [{ id: 'x', label: 'Conversion' }, { id: 'y', label: 'Retention' }] },
          { key: 'c', type: 'free', prompt: 'What budget range are we in?', options: [] },
        ],
      },
      usage: null, model: 'test',
    });
    const out = await generateIntakeBatch({ topic: 't', answered: [], count: 5 });
    expect(out.source).toBe('llm');
    expect(out.questions.map((q) => q.key)).toEqual(['a', 'c']);
  });

  it('falls back empty when nothing usable comes back', async () => {
    vi.mocked(chatJson).mockResolvedValue({ data: { questions: [{ nope: true }] }, usage: null, model: 'test' });
    const out = await generateIntakeBatch({ topic: 't', answered: [] });
    expect(out.questions).toEqual([]);
    expect(out.source).toBe('fallback');
  });
});
