import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scheduledJobs } from '../hub/scheduled-policy.js';

// A separate supervisor can stop even a blocked event loop. Do not release a
// lease on timeout: partial work may exist; the next run replays after expiry.
export function supervise({ name, timeoutMs, workerUrl = new URL('./worker.js', import.meta.url) }) {
  return new Promise((resolve, reject) => {
    const child = fork(workerUrl, [name, String(timeoutMs)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let interruptedCode;
    const terminate = (code) => { interruptedCode = code; child.kill('SIGKILL'); };
    const timer = setTimeout(() => terminate(124), timeoutMs);
    const onTerm = () => terminate(143);
    const onInt = () => terminate(130);
    process.once('SIGTERM', onTerm);
    process.once('SIGINT', onInt);
    const cleanup = () => {
      clearTimeout(timer);
      process.removeListener('SIGTERM', onTerm);
      process.removeListener('SIGINT', onInt);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', code => { cleanup(); resolve(interruptedCode ?? code ?? 1); });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const timeoutMs = Number(process.env.NIBGATE_JOB_TIMEOUT_MS || 240_000);
  if (!Object.hasOwn(scheduledJobs, name) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 240_000) {
    console.error(`Usage: jobs:run <${Object.keys(scheduledJobs).join('|')}>; timeout must be 1000..240000ms`);
    process.exitCode = 1;
  } else {
    process.exitCode = await supervise({ name, timeoutMs }).catch(() => 1);
  }
}
