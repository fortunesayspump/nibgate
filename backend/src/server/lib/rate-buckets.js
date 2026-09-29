// Shared TTL sweeper for in-memory rate-limit buckets.
//
// Buckets are keyed by client IP (or visitor hash), so without periodic
// eviction every distinct client that ever hits the endpoint leaves a
// permanent entry and the process balloons over days. One unref'd interval
// keeps every registered bucket bounded; entries are dropped once their
// window has expired.
const REGISTRY = new Set();
let sweeperStarted = false;

function startRateBucketSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  const intervalMs = Number.parseInt(process.env.RATE_BUCKET_SWEEP_INTERVAL_MS || '60000', 10);
  setInterval(() => {
    const now = Date.now();
    for (const { map, ttlMs } of REGISTRY) {
      for (const [key, value] of map) {
        const expiry = value.resetAt ?? (value.start + ttlMs);
        if (expiry <= now) map.delete(key);
      }
    }
  }, intervalMs).unref?.();
}

export function registerRateBuckets(map, ttlMs) {
  REGISTRY.add({ map, ttlMs });
  startRateBucketSweeper();
  return map;
}
