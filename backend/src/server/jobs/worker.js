import { takeIndexDiagnostics } from './index-diagnostics.js';
import { runIndexBatches } from './index-batches.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scheduledJobs, scheduledMonitorEnabled } from '../hub/scheduled-policy.js';
import { runLeasedJob } from './state.js';
import { withDatabasePoolDefaults } from '../lib/database-pool.js';

export async function runWorker({ name, timeoutMs, env = process.env, load = async () => {
  if (env.DATABASE_URL) env.DATABASE_URL = withDatabasePoolDefaults(env.DATABASE_URL);
  const { db } = await import('@nibgate/internal/db.js');
  try {
    const monitors = await import('../hub/monitors.js');
    const { fetchSiteList } = await import('../hub/gsc-sitemap.js');
    const { runIndexSweep } = await import('../hub/gsc-index.js');
    const { runMetricCleanup } = await import('../hub/helpers.js');
    const { enrichMissingMetadata } = await import('../jev/metadata.js');
    return { db, monitors: { ...monitors, fetchGscSites: fetchSiteList, runGscIndexSite: domain => runIndexSweep({ domains: [domain] }), runMetricCleanup, runMetadataSweep: () => enrichMissingMetadata({ limit: Number(env.NIBGATE_METADATA_ENRICH_BATCH || 8) }) } };
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
} }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 240_000) throw new Error('Invalid job timeout');
  if (!Object.hasOwn(scheduledJobs, name)) throw new Error('Unknown job');
  if (!scheduledMonitorEnabled(name, env)) throw new Error('Job must be selected in NIBGATE_SCHEDULED_MONITORS');
  if (!env.NIBGATE_JOB_SCOPE) throw new Error('NIBGATE_JOB_SCOPE is required (unique database/network/chain/contract scope)');
  // Explicit initial block prevents silently losing history when first switching
  // from the embedded in-memory cursor. Subsequent invocations use the DB cursor.
  if (name === 'reputation' && !/^\d+$/.test(env.NIBGATE_REPUTATION_START_BLOCK || '')) {
    throw new Error('NIBGATE_REPUTATION_START_BLOCK is required');
  }
  const disabledFlag = { manifest: 'MANIFEST_SYNC_DISABLED', reputation: 'NIBGATE_REPUTATION_INDEXER_DISABLED', 'gsc-sitemap': 'GSC_SITEMAP_MONITOR_DISABLED', 'gsc-index': 'GSC_INDEX_MONITOR_DISABLED' }[name];
  if (env[disabledFlag] === 'true') throw new Error('Selected monitor is explicitly disabled');
  const { db, monitors } = await load();
  try {
    return await runLeasedJob({ db, key: `${env.NIBGATE_JOB_SCOPE}:${name}`, intervalMs: scheduledJobs[name], timeoutMs,
      run: async (cursor, checkpoint) => {
        if (name === 'reputation') {
          let previous = cursor ?? String(BigInt(env.NIBGATE_REPUTATION_START_BLOCK) - 1n);
          // Four-hour cadence needs multiple RPC-sized chunks. Persist each
          // completed chunk so a deadline never discards successful backfill.
          for (let chunk = 0; chunk < 100; chunk += 1) {
            const result = await monitors.runReputationIndexSweep({ cursor: previous, maxBlocks: 5000 });
            if (!result.ok) throw new Error(`Reputation sweep failed: ${result.reason}`);
            if (BigInt(result.toBlock) <= BigInt(previous)) return previous;
            previous = result.toBlock;
            await checkpoint(previous);
            if (BigInt(result.toBlock) - BigInt(result.fromBlock) + 1n < 5000n) return previous;
          }
          throw new Error('Reputation catch-up remains; checkpoint saved');
        }
        if (name === 'gsc-index') {
          if (!env.GSC_SERVICE_ACCOUNT_JSON) throw new Error('GSC credentials are required');
          return runIndexBatches({ cursor, checkpoint, fetchSites: monitors.fetchGscSites, inspectSite: monitors.runGscIndexSite });
        }
        const methods = { verification: 'runVerificationSweep', integrity: 'runDataIntegritySweep', metadata: 'runMetadataSweep', 'metric-cleanup': 'runMetricCleanup', manifest: 'runManifestSyncSweep', 'gsc-sitemap': 'runGscSitemapSweep', 'gsc-index': 'runGscIndexSweep' };
        if (name.startsWith('gsc-') && !env.GSC_SERVICE_ACCOUNT_JSON) throw new Error('GSC credentials are required');
        await monitors[methods[name]]();
        return cursor;
      },
    });
  } finally {
    try { await db.$disconnect(); } finally {
      if (name.startsWith('gsc-')) console.log('[gsc-diagnostics]', JSON.stringify(takeIndexDiagnostics()));
    }
  }
}

if (process.send && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.once('disconnect', () => process.exit(1));
  runWorker({ name: process.argv[2], timeoutMs: Number(process.argv[3]) })
    .then(result => { console.log('[hub-job]', process.argv[2], JSON.stringify(result)); process.exit(0); })
    .catch(() => { console.error('[hub-job] failed; checkpoint not advanced'); process.exit(1); });
}
