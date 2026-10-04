import { describe, expect, it, vi } from 'vitest';

vi.mock('./client.js', () => ({ decide: vi.fn(), JevUnavailable: class JevUnavailable extends Error {} }));

import { decide } from './client.js';
import { decideIntakeStop } from './intake.js';

describe('intake stop with frame reject', () => {
  it('returns reframe (not done) when JEV rejects the angle', async () => {
    vi.mocked(decide).mockResolvedValue({ pick: 'reframe', probabilities: { reframe: 0.7 }, model: 't' });
    const out = await decideIntakeStop({ topic: 't', answeredKeys: ['a'], remainingKeys: ['b'], lastAnswer: 'x' });
    expect(out.done).toBe(false);
    expect(out.reframe).toBe(true);
    expect(out.source).toBe('jev');
  });

  it('proceed still means done', async () => {
    vi.mocked(decide).mockResolvedValue({ pick: 'proceed', probabilities: { proceed: 0.9 }, model: 't' });
    const out = await decideIntakeStop({ topic: 't' });
    expect(out.done).toBe(true);
    expect(out.reframe).toBe(false);
  });

  it('falls back without a verdict when JEV is unreachable', async () => {
    const { JevUnavailable } = await import('./client.js');
    vi.mocked(decide).mockRejectedValue(new JevUnavailable('down'));
    const out = await decideIntakeStop({ topic: 't' });
    expect(out.done).toBeNull();
    expect(out.source).toBe('fallback');
  });
});
