import { describe, it, expect } from 'vitest';
import { memorySample, parseLinuxMemoryStatus } from './memory-diagnostics.js';

describe('memory diagnostics privacy', () => {
  it('emits only whitelisted numeric status counters', () => {
    const status = 'Name:\tprivate-name\nRssAnon:\t2048 kB\nRssFile:\t1024 kB\nRssShmem:\t0 kB\nVmData:\t4096 kB\nThreads:\t12\nSecret:\t12345 kB\n';
    expect(parseLinuxMemoryStatus(status)).toEqual({ anonymousMiB: 2, fileMiB: 1, sharedMiB: 0, dataMiB: 4, threads: 12 });
  });
  it('ignores malformed fields rather than copying raw values', () => {
    expect(parseLinuxMemoryStatus('RssAnon: private\nThreads: secret\nRssFile: 1024 bytes')).toEqual({});
  });
  it('samples counters without exposing environment values', () => {
    const sample = memorySample();
    expect(sample.rssMiB).toBeGreaterThan(0);
    expect(sample.heapUsedMiB).toBeGreaterThan(0);
    expect(sample).not.toHaveProperty('environmentVariables');
    expect(Object.values(sample.resources).every(Number.isInteger)).toBe(true);
  });
});
