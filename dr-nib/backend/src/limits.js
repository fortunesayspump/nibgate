// Per-user run limits.
//
// Every live run holds a funded cap and spends provider money the operator
// fronts. Without a ceiling, one account can open many runs at once and exhaust
// the provider budget and rate limits — a denial-of-wallet against Nibgate, not
// the payer. The cap is on *live* runs, not total projects: finished and ended
// projects never count, so a user is limited by what is actually in flight.
import { db } from './db.js';
import { config } from './env.js';

// Non-terminal, un-deleted statuses: work that is still in flight or waiting on
// the user. `paused` and `awaiting` count — they are resumable and may hold
// funds — while `ended`/`complete`/`failed` do not. Abandoned composers don't
// count either: an intake/intake-done run untouched for 72h holds no money
// (escrow can't open before planning) and is just a tab someone closed.
export const ACTIVE_STATUSES = ['intake', 'intake-done', 'planning', 'planned', 'running', 'paused', 'awaiting'];

const INTAKE_STALE_MS = 72 * 3600 * 1000;

export function maxActiveRuns() {
  return config.maxActiveRuns;
}

export async function countActiveRuns(userId) {
  if (!userId) return 0;
  const staleBefore = new Date(Date.now() - INTAKE_STALE_MS);
  const [total, staleIntake] = await Promise.all([
    db.researchRun.count({
      where: { userId, deletedAt: null, status: { in: ACTIVE_STATUSES } },
    }),
    db.researchRun.count({
      where: { userId, deletedAt: null, status: { in: ['intake', 'intake-done'] }, updatedAt: { lt: staleBefore } },
    }),
  ]);
  return total - staleIntake;
}

/**
 * Gate a new run for a user. Returns { ok:true } or a 429 the caller returns
 * verbatim — so the HTTP route and the MCP tool say the same thing.
 */
export async function assertCanCreateRun(userId) {
  const active = await countActiveRuns(userId);
  const cap = maxActiveRuns();
  if (active >= cap) {
    return {
      ok: false,
      status: 429,
      error: `you already have ${active} live run${active === 1 ? '' : 's'} (limit ${cap}). Finish or end one before starting another.`,
      active,
      cap,
    };
  }
  return { ok: true, active, cap };
}
