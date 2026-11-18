import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A scheduled invocation performs one complete sweep and exits. There is no
// kill timer: financial operations drain before the database is disconnected.
export async function runFeeJob({ sweep, disconnect, signals = process }) {
  // Defer termination while a financial operation may be in flight.
  const drain = () => {};
  signals.on('SIGTERM', drain); signals.on('SIGINT', drain);
  try {
    const result = await sweep();
    const failed = result?.disabled || result?.skipped || result?.error || result?.holding?.error
      || result?.wallets?.some(row => row.error || row.ghostRecovery?.error
        || row.gateway?.reason?.startsWith('gateway:') || row.distributed?.reason?.startsWith('distribute:'))
      || result?.holding?.results?.some(row => row.error);
    if (failed) throw new Error('Fee job incomplete; retry at next scheduled invocation');
    return result;
  } finally {
    try { await disconnect(); } finally {
      signals.removeListener('SIGTERM', drain); signals.removeListener('SIGINT', drain);
    }
  }
}

export async function runFeeWorker({ sweep, disconnect, intervalMs = 15 * 60_000, signals = process }) {
  let stopped = false;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  signals.once('SIGTERM', stop);
  signals.once('SIGINT', stop);
  try {
    while (!stopped) {
      try { await sweep(); } catch { console.error('[fee-worker] sweep failed; next cycle will retry'); }
      if (stopped) break;
      await new Promise(resolve => {
        const timer = setTimeout(resolve, intervalMs);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    }
  } finally {
    signals.removeListener('SIGTERM', stop);
    signals.removeListener('SIGINT', stop);
    await disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NIBGATE_FEE_KEEPER_EXTERNAL !== 'true') throw new Error('Dedicated keeper requires external mode');
  const { db } = await import('@nibgate/internal/db.js');
  const { runRevenueSweep, feeKeeperIntervalMs } = await import('../revenue/keeper.js');
  // One replica, zero rollout overlap, generous drain. Unlike nonfinancial cron,
  // do not kill an in-flight financial operation on a four-minute timer.
  if (process.env.NIBGATE_FEE_WORKER_MODE === 'scheduled') {
    try {
      await runFeeJob({ sweep: runRevenueSweep, disconnect: () => db.$disconnect() });
      console.log('[fee-job] completed');
      process.exitCode = 0;
    } catch { console.error('[fee-job] incomplete; retry next cadence'); process.exitCode = 1; }
  } else {
    await runFeeWorker({ sweep: runRevenueSweep, disconnect: () => db.$disconnect(), intervalMs: feeKeeperIntervalMs() });
  }
}
