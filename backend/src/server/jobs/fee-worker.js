import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  await runFeeWorker({ sweep: runRevenueSweep, disconnect: () => db.$disconnect(), intervalMs: feeKeeperIntervalMs() });
}
