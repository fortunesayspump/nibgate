import { scheduledJobs, scheduledMonitorEnabled } from '../hub/scheduled-policy.js';
import { supervise } from './run.js';

// One bounded cron container per network. Daily jobs retain their durable daily
// slot even though this dispatcher runs every four hours. Continue independent
// jobs after a failure, but return failure for alerting.
let failed = false;
for (const name of Object.keys(scheduledJobs)) {
  if (!scheduledMonitorEnabled(name)) continue;
  const code = await supervise({ name, timeoutMs: 240_000 });
  console.log('[maintenance]', name, 'exit', code);
  if (code === 130 || code === 143) process.exit(code);
  if (code !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
