import {createHmac} from 'node:crypto';

// Broker-side half of the internal money bridge. The broker proves a verified
// guest receipt and asks the backend (which owns the ledger) to draw the user's
// budget by that exact amount. Disabled — and therefore inert — unless both the
// shared secret and the backend URL are configured.
function configuredBase(env) {
  const raw = env.DRNIB_PRIVATE_BROKER_MONEY_URL;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
    return url;
  } catch { return null; }
}

/**
 * @param {{env?:object, fetchImpl?:Function, now?:Function}} opts
 * @returns {null|{enabled:true, draw:Function, settle:Function}}
 */
export function createPrivateBrokerMoney({env = process.env, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000)} = {}) {
  const base = configuredBase(env);
  const secret = env.DRNIB_PRIVATE_BROKER_MONEY_SECRET;
  if (!base || typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) return null;

  async function call(route, payload) {
    const body = JSON.stringify(payload);
    const ts = now();
    const sig = createHmac('sha256', secret).update(`${ts}.`).update(body).digest('hex');
    const endpoint = new URL(route, base);
    if (endpoint.origin !== base.origin) return null;
    const response = await fetchImpl(endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-drnib-ts': String(ts), 'x-drnib-sig': sig },
      body, signal: AbortSignal.timeout(10_000),
    });
    if (response.redirected === true || !response.ok) return null;
    return response.json().catch(() => null);
  }

  return {
    enabled: true,
    // amountUsd is a decimal string; txRef is the verified receipt id so retries
    // dedupe on the ledger's (runId, kind, txRef) unique path.
    draw: ({ runId, tenantId, amountUsd, txRef }) => call('internal/draw', { runId, tenantId, amountUsd, txRef }),
    settle: ({ runId, tenantId, reason }) => call('internal/settle', { runId, tenantId, reason }),
  };
}
