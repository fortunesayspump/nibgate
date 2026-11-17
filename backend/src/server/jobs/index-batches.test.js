import { describe, it, expect, vi } from 'vitest';
import { runIndexBatches } from './index-batches.js';

describe('resumable index inspection', () => {
  it('persists each site, resumes after interruption, and clears completed cursor', async () => {
    let saved = null;
    const inspectSite = vi.fn().mockResolvedValue({ errors: [] });
    const checkpoint = async value => { saved = value; if (value && JSON.parse(value).after === 'b') throw Error('process interrupted'); };
    await expect(runIndexBatches({ cursor: null, checkpoint, fetchSites: async () => ['c', 'b', 'a'], inspectSite })).rejects.toThrow('interrupted');
    expect(inspectSite.mock.calls.map(c => c[0])).toEqual(['a', 'b']);
    inspectSite.mockClear();
    await runIndexBatches({ cursor: saved, checkpoint: async value => { saved = value; }, fetchSites: async () => ['a', 'c', 'b'], inspectSite });
    expect(inspectSite.mock.calls.map(c => c[0])).toEqual(['c']); expect(saved).toBeNull();
  });
  it('preserves failures across restarts, continues other sites and does not mark a failed cycle complete', async () => {
    const values = []; const inspectSite = vi.fn().mockResolvedValue({ errors: ['quota'] });
    await expect(runIndexBatches({ cursor: JSON.stringify({ after: 'a', failures: ['a'] }), checkpoint: async v => values.push(v), fetchSites: async () => ['a', 'b', 'c'], inspectSite })).rejects.toThrow('3 sites');
    expect(inspectSite).toHaveBeenCalledTimes(2); expect(values.at(-1)).toBeNull();
    expect(JSON.parse(values[1]).failures).toEqual(['a', 'b', 'c']);
  });
  it('yields a checkpointed partial batch without declaring the daily cycle complete', async () => {
    let elapsed = 0; const checkpoints = [];
    const inspectSite = vi.fn(async () => { elapsed += 160; return { errors: [] }; });
    const result = await runIndexBatches({ cursor: null, checkpoint: async v => checkpoints.push(v), fetchSites: async () => ['a', 'b'], inspectSite, now: () => elapsed, budgetMs: 150 });
    expect(result).toEqual({ pending: true });
    expect(inspectSite).toHaveBeenCalledTimes(1);
    expect(JSON.parse(checkpoints.at(-1))).toEqual({ after: 'a', failures: [] });
  });

});
