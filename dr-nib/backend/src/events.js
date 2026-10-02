// SSE fan-out per run. In-process for the scaffold; moves to Redis
// pub/sub when workers scale past one process.
const channels = new Map();

export function publish(runId, event) {
  const payload = { ...event, at: new Date().toISOString() };
  const idLine = Number.isInteger(payload.seq) ? `id: ${payload.seq}\n` : '';
  for (const res of channels.get(runId) || []) {
    try { res.write(`${idLine}data: ${JSON.stringify(payload)}\n\n`); } catch {}
  }
}

export function subscribe(runId, res) {
  if (!channels.has(runId)) channels.set(runId, new Set());
  channels.get(runId).add(res);
  res.on('close', () => {
    const set = channels.get(runId);
    if (set) { set.delete(res); if (!set.size) channels.delete(runId); }
  });
}
