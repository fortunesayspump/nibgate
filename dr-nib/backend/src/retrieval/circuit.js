// Provider circuit breaker.
//
// Metered providers fail — keys expire, quotas exhaust, endpoints go down. Without
// a breaker, every query in every run keeps paying the timeout for a provider
// that is already known to be down. The circuit fixes that: after a streak of
// consecutive failures a provider is skipped for a cooling period, then granted
// one half-open probe; a probe failure doubles the cooling (up to a ceiling),
// a real success clears the streak entirely.
//
// The state lives per process: our workers are few, and the failure mode of a
// split view is only extra retries, never wrongness. If workers ever scale far
// past one process per provider, move this state into Postgres so they share it.

const circuits = new Map();

export function circuitThreshold() {
  const n = Number(process.env.RETRIEVAL_CIRCUIT_FAILURES);
  return Number.isInteger(n) && n > 0 ? n : 3;
}

export function baseCooldownMs() {
  const n = Number(process.env.RETRIEVAL_CIRCUIT_COOLDOWN_MS);
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

export function maxCooldownMs() {
  const n = Number(process.env.RETRIEVAL_CIRCUIT_MAX_COOLDOWN_MS);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60_000;
}

/**
 * May this provider be called now?
 * @returns {{allowed:boolean, probe:boolean, retryAfterMs:number}}
 */
export function circuitAllows(name, now = Date.now()) {
  const c = circuits.get(name);
  if (!c || c.failures < circuitThreshold()) return { allowed: true, probe: false, retryAfterMs: 0 };
  if (now < c.openUntil) return { allowed: false, probe: false, retryAfterMs: c.openUntil - now };
  return { allowed: true, probe: true, retryAfterMs: 0 };
}

export function circuitSuccess(name) {
  circuits.delete(name);
}

export function circuitFailure(name, now = Date.now()) {
  const c = circuits.get(name) || { failures: 0, cooldownMs: baseCooldownMs(), openUntil: 0 };
  c.failures += 1;
  if (c.failures >= circuitThreshold()) {
    c.openUntil = now + c.cooldownMs;
    c.cooldownMs = Math.min(c.cooldownMs * 2, maxCooldownMs());
  }
  circuits.set(name, c);
  return c;
}

export function circuitState(name) {
  return circuits.get(name) || null;
}

export function __resetCircuits() {
  circuits.clear();
}
