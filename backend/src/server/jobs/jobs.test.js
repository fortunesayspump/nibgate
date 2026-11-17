import { describe, it, expect, vi, afterEach } from 'vitest';
import { runWorker } from './worker.js';
import { runLeasedJob } from './state.js';
import { scheduledMonitorEnabled } from '../hub/scheduled-policy.js';
import { supervise } from './run.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const mocks = vi.hoisted(() => ({ getBlockNumber: vi.fn(), getLogs: vi.fn(), findMany: vi.fn(), sync: vi.fn(), sitemap: vi.fn(), index: vi.fn(), upsert: vi.fn() }));
vi.mock('@nibgate/internal/db.js', () => ({ db: { website: { findMany: mocks.findMany } } }));
vi.mock('viem', () => ({ createPublicClient: () => mocks, http: vi.fn(), fallback: vi.fn(), decodeEventLog: () => ({ eventName: 'ContentRated', args: {} }) }));
vi.mock('../hub/gsc-sitemap.js', () => ({ submitAllSiteSitemaps: mocks.sitemap }));
vi.mock('../hub/gsc-index.js', () => ({ runIndexSweep: mocks.index }));
vi.mock('../hub/helpers.js', () => ({ CONTENT_RATED_EVENT: {}, findContentByHash: async () => ({ id: 'a' }), upsertOnchainRatingForContent: mocks.upsert, syncWebsiteManifest: mocks.sync }));

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks(); });
const env = { NIBGATE_SCHEDULED_MONITORS: 'reputation', NIBGATE_JOB_SCOPE: 'fixture', NIBGATE_REPUTATION_START_BLOCK: '10' };
function database(cursor = null) {
  return { $queryRaw: vi.fn().mockResolvedValue([{ cursor }]), $executeRaw: vi.fn().mockResolvedValue(1), $disconnect: vi.fn().mockResolvedValue() };
}

describe('scheduled monitors', () => {
  it('disables embedded timers including repeat/admin starts, defaults unchanged', async () => {
    vi.resetModules(); vi.useFakeTimers();
    vi.stubEnv('NIBGATE_SCHEDULED_MONITORS', 'manifest,reputation,gsc-sitemap,gsc-index');
    vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}');
    const m = await import('../hub/monitors.js');
    const starts = [m.startManifestSyncMonitor, m.startReputationIndexer, m.startGscSitemapMonitor, m.startGscIndexMonitor];
    starts.forEach(f => { f(); f(); });
    expect(vi.getTimerCount()).toBe(0);
    vi.stubEnv('NIBGATE_SCHEDULED_MONITORS', '');
    starts.forEach(f => f());
    expect(vi.getTimerCount()).toBe(4);
    vi.clearAllTimers();
  });
  it('fails closed on typo', () => expect(() => scheduledMonitorEnabled('manifest', { NIBGATE_SCHEDULED_MONITORS: 'settlement' })).toThrow());
  it('catches up from a persisted block in bounded ranges and retries failed ranges', async () => {
    vi.resetModules(); vi.stubEnv('NIBGATE_REPUTATION_CONTRACT', '0xabc');
    mocks.getBlockNumber.mockResolvedValue(20000n); mocks.getLogs.mockResolvedValue([]);
    const { runReputationIndexSweep } = await import('../hub/monitors.js');
    expect(await runReputationIndexSweep({ cursor: '10', maxBlocks: 5000 })).toMatchObject({ fromBlock: '11', toBlock: '5010' });
    mocks.getLogs.mockRejectedValueOnce(new Error('RPC outage'));
    await expect(runReputationIndexSweep({ cursor: '5010', maxBlocks: 5000 })).rejects.toThrow('RPC outage');
    expect(await runReputationIndexSweep({ cursor: '5010', maxBlocks: 5000 })).toMatchObject({ fromBlock: '5011', toBlock: '10010' });
  });
  it('reports partial manifest and Google failures', async () => {
    const m = await import('../hub/monitors.js');
    mocks.findMany.mockResolvedValue([{ id: 'a' }]); mocks.sync.mockResolvedValue({ ok: false });
    await expect(m.runManifestSyncSweep()).rejects.toThrow('Manifest sweep');
    mocks.sitemap.mockResolvedValue({ failed: ['site'], domains: 1 });
    await expect(m.runGscSitemapSweep()).rejects.toThrow('GSC sitemap');
    mocks.index.mockResolvedValue({ errors: ['site'], notIndexedList: [] });
    await expect(m.runGscIndexSweep()).rejects.toThrow('GSC index');
  });
  it('checkpoints success and disconnects; resumes from persisted cursor', async () => {
    const db = database('500'); const run = vi.fn().mockResolvedValue({ ok: true, toBlock: '5500' });
    await runWorker({ name: 'reputation', timeoutMs: 1000, env, load: async () => ({ db, monitors: { runReputationIndexSweep: run } }) });
    expect(run).toHaveBeenCalledWith({ cursor: '500', maxBlocks: 5000 });
    expect(db.$executeRaw.mock.calls[0]).toContain('5500');
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it('releases on failure without checkpoint and disconnects', async () => {
    const db = database();
    await expect(runWorker({ name: 'reputation', timeoutMs: 1000, env, load: async () => ({ db, monitors: { runReputationIndexSweep: async () => { throw Error('fail'); } } }) })).rejects.toThrow('fail');
    expect(db.$executeRaw).toHaveBeenCalledOnce();
    expect(db.$executeRaw.mock.calls[0][0].join('')).not.toContain('completedAt');
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it('skips active/completed claims and rejects stale ownership', async () => {
    const db = database(); const run = vi.fn(); db.$queryRaw.mockResolvedValue([]);
    expect(await runLeasedJob({ db, key: 'x', intervalMs: 1, timeoutMs: 1000, run })).toEqual({ skipped: true });
    expect(run).not.toHaveBeenCalled();
    db.$queryRaw.mockResolvedValue([{ cursor: null }]); db.$executeRaw.mockResolvedValue(0);
    await expect(runLeasedJob({ db, key: 'x', intervalMs: 1, timeoutMs: 1000, run })).rejects.toThrow('lease lost');
  });
  it('rejects invalid config before loading resources', async () => {
    const load = vi.fn();
    await expect(runWorker({ name: 'reputation', env: {}, timeoutMs: 1000, load })).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
  it('exits successfully or unsuccessfully and kills hung worker within budget', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hub-job-fixture-'));
    try {
      const file = join(dir, 'worker.cjs');
      for (const [source, expected] of [['process.exit(0)', 0], ['process.exit(1)', 1], ['while (true) {}', 124]]) {
        await writeFile(file, source);
        expect(await supervise({ name: 'fixture', timeoutMs: 500, workerUrl: pathToFileURL(file) })).toBe(expected);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
