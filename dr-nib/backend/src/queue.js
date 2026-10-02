import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

let mode = 'inline';
let queues = {};
let connection = null;

export function queueMode() { return mode; }

export async function initQueue() {
  const url = process.env.REDIS_URL;
  if (!url) { mode = 'inline'; return; }
  try {
    connection = new IORedis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
    await connection.ping();
    mode = 'bullmq';
  } catch {
    mode = 'inline';
    connection = null;
  }
}

function getQueue(name) {
  if (!queues[name]) queues[name] = new Queue(name, { connection });
  return queues[name];
}

export async function enqueue(name, data, opts = {}) {
  if (mode !== 'bullmq') {
    const { runInline } = await import('./worker.js');
    setImmediate(() => runInline(name, data).catch((e) => console.error(`[dr-nib] inline ${name} failed:`, e.message)));
    return { id: `inline-${Date.now()}`, mode };
  }
  const job = await getQueue(name).add(name, data, { removeOnComplete: 100, removeOnFail: 500, ...opts });
  return { id: job.id, mode };
}

export function startWorkers(handlers) {
  if (mode !== 'bullmq') return [];
  const workers = [];
  for (const [name, fn] of Object.entries(handlers)) {
    workers.push(new Worker(name, async (job) => fn(job.data, job), { connection }));
  }
  return workers;
}

export async function closeQueue(workers = []) {
  for (const w of workers) {
    try { await w.close(); } catch {}
  }
  if (connection) {
    const c = connection;
    connection = null;
    try { await c.quit(); } catch {}
  }
}
