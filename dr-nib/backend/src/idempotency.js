// Idempotency for mutating routes.
//
// A retried request — double-click, dropped connection replayed by the client —
// must not execute twice when the second execution would spend money or mutate
// a run. Clients send Idempotency-Key; the first execution's status and body
// are stored, and a repeat key replays them verbatim.
//
// Concurrency is handled, not just sequential retries: the row is claimed
// first with statusCode 0 (in flight). A duplicate arriving while the first is
// still running gets 409 instead of a second execution; a stale in-flight row
// (older than the settle window) is treated as abandoned and re-executed once.
// Keys are scoped per user, so one account can never replay another's response.
import { db } from './db.js';

const IN_FLIGHT_MS = 60_000;

export async function idempotency(req, res, next) {
  try {
    const raw = String(req.headers['idempotency-key'] || '').trim().slice(0, 128);
    if (!raw || !req.user || !['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
    // Scope the key to the operation (method + path, which carries the run
    // id): the same key retried against the same endpoint replays, but a key
    // reused for a different run or endpoint executes fresh. Replaying another
    // run's receipt as this run's money would be the worst possible outcome.
    const key = `${req.method} ${req.path} ${raw}`.slice(0, 256);
    const existing = await db.idempotencyKey.findUnique({
      where: { userId_key: { userId: req.user.id, key } },
    });
    if (existing) {
      if (existing.statusCode === 0 && Date.now() - new Date(existing.createdAt).getTime() < IN_FLIGHT_MS) {
        return res.status(409).json({ error: 'request already in flight' });
      }
      if (existing.statusCode !== 0) {
        return res.status(existing.statusCode).json(existing.response ?? {});
      }
      // Stale in-flight row: reclaim it and execute once.
      await db.idempotencyKey.delete({ where: { id: existing.id } }).catch(() => {});
    }

    try {
      await db.idempotencyKey.create({ data: { userId: req.user.id, key, statusCode: 0, response: {} } });
    } catch (err) {
      // Lost the claim race: the winner is executing; do not run twice.
      if (err?.code === 'P2002') return res.status(409).json({ error: 'request already in flight' });
      return next();
    }

    const finish = res.json.bind(res);
    res.json = (body) => {
      const payload = body ?? {};
      let stored = {};
      try { stored = JSON.parse(JSON.stringify(payload)); } catch { stored = {}; }
      db.idempotencyKey.update({
        where: { userId_key: { userId: req.user.id, key } },
        data: { statusCode: res.statusCode, response: stored },
      }).catch(() => {});
      return finish(body);
    };
    return next();
  } catch {
    // Idempotency must never break the request it guards. If the lookup
    // itself fails, execute normally rather than refusing.
    return next();
  }
}
