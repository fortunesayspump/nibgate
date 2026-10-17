import {Router} from 'express';
import express from 'express';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {isConfidentialRun} from './guard.js';

// Broker-authenticated internal money bridge. The broker is the only caller and
// it never touches the ledger directly: it proves a verified guest receipt and
// asks this route to draw the user's budget by that exact amount. HMAC over the
// raw body + a short timestamp window keeps it replay- and forgery-resistant.
//
// Mounted ONLY on the normal backend (which owns the ledger). The broker-only
// entrypoint must never mount it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USD = /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,6})?$/;
const SKEW_SECONDS = 60;

function sign(secret, ts, raw) {
  return createHmac('sha256', secret).update(`${ts}.`).update(raw).digest();
}

// Constant-time hex compare; length differences are not secret-dependent here
// (both are fixed-width digests) but guard against malformed input anyway.
function matches(expected, provided) {
  if (typeof provided !== 'string' || !/^[0-9a-f]{64}$/.test(provided)) return false;
  const given = Buffer.from(provided, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * @param {{store:object, drawImpl:Function, settleImpl:Function, secret?:string, now?:Function}} opts
 */
export function createPrivateMoneyRouter({store, drawImpl, settleImpl,
  secret = process.env.DRNIB_PRIVATE_BROKER_MONEY_SECRET, now = () => Math.floor(Date.now() / 1000)} = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PRIVATE_MONEY_SECRET_INVALID');
  }
  if (!store?.researchRun || typeof drawImpl !== 'function' || typeof settleImpl !== 'function') {
    throw new Error('PRIVATE_MONEY_WIRING_INVALID');
  }
  const router = Router();
  router.use(express.raw({ type: 'application/json', limit: '64kb' }));

  function verify(req) {
    const ts = Number(req.get('x-drnib-ts'));
    if (!Number.isSafeInteger(ts) || Math.abs(now() - ts) > SKEW_SECONDS) return null;
    const raw = Buffer.isBuffer(req.body) ? req.body : null;
    if (!raw || raw.length === 0) return null;
    if (!matches(sign(secret, ts, raw), req.get('x-drnib-sig'))) return null;
    try { return JSON.parse(raw.toString('utf8')); } catch { return null; }
  }

  // Resolve the run and enforce tenant + confidential ownership before any
  // ledger write. Fail closed on anything unexpected.
  async function ownedRun(runId, tenantId) {
    if (!UUID.test(runId || '') || typeof tenantId !== 'string' || !tenantId) return null;
    const run = await store.researchRun.findUnique({ where: { id: runId } });
    if (!run || run.deletedAt != null || run.userId !== tenantId) return null;
    if (run.settledAt != null) return null;
    return isConfidentialRun(run) ? run : null;
  }

  router.post('/internal/draw', async (req, res) => {
    try {
      const body = verify(req);
      if (!body) return res.status(401).json({ code: 'PRIVATE_MONEY_UNAUTHENTICATED' });
      const { runId, tenantId, amountUsd, txRef } = body;
      if (!USD.test(amountUsd || '') || !Number.isFinite(Number(amountUsd))) {
        return res.status(400).json({ code: 'PRIVATE_MONEY_BAD_AMOUNT' });
      }
      if (txRef != null && (typeof txRef !== 'string' || txRef.length > 128)) {
        return res.status(400).json({ code: 'PRIVATE_MONEY_BAD_TXREF' });
      }
      const run = await ownedRun(runId, tenantId);
      if (!run) return res.status(404).json({ code: 'PRIVATE_MONEY_NO_RUN' });
      const result = await drawImpl(runId, amountUsd, 'spend', txRef ?? null);
      return res.json(result);
    } catch (err) {
      const status = err?.status === 409 ? 409 : 503;
      return res.status(status).json({ code: 'PRIVATE_MONEY_UNAVAILABLE' });
    }
  });

  router.post('/internal/settle', async (req, res) => {
    try {
      const body = verify(req);
      if (!body) return res.status(401).json({ code: 'PRIVATE_MONEY_UNAUTHENTICATED' });
      const { runId, tenantId } = body;
      const run = await ownedRun(runId, tenantId);
      if (!run) return res.status(404).json({ code: 'PRIVATE_MONEY_NO_RUN' });
      const result = await settleImpl(runId, typeof body.reason === 'string' ? body.reason.slice(0, 128) : 'complete');
      return res.json(result);
    } catch (err) {
      const status = err?.status === 409 ? 409 : 503;
      return res.status(status).json({ code: 'PRIVATE_MONEY_UNAVAILABLE' });
    }
  });

  return router;
}
