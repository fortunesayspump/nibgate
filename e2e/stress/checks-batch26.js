// Batch 26 — Untested-surface sweep + rating integration fix verification.
//   Covers:
//     - subblog rating: GET stats (db + onchain source), POST prepare step
//       (no txHash) resolves via hub externalId now that hub lookups match
//       externalId OR internal id (fix: findContentByIdOrExternal)
//     - subblog admin/owner authz completeness: access-control PUT/DELETE,
//       revoke POST, settings password PUT, link-hub POST — all reject anon 401
//     - subblog auth validation: register/login reject malformed payloads
//       (no account mutation), upload GET 404, nonce GET
//     - hub: rating prepare/index/rate accept externalId (subblog UUID),
//       gateway/balance POST public, widget.js serves 200
//   All API-level, read-only or validation-error responses (no mutations).
const { SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://api.nibgate.xyz';
const CAT = 'https://catwalk.nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const DOC_ID = '9afad033-cb27-45fb-8238-8a92ed031d85';
const DOC_PATH = '/docs/lookbook-materials-d14';

async function jcall(context, url, method = 'GET', data = null) {
  const opts = { headers: { 'content-type': 'application/json' } };
  if (data !== null) opts.data = data;
  const r = await context.request[method.toLowerCase()](url, opts);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status(), json, raw: (await r.text()).slice(0, 140) };
}

const checks = [
  // ---- Subblog rating surface ----
  {
    id: 'b26-rating-get-db', group: 'subblog-rating', name: 'subblog: GET /api/rating/:id returns stats (db or onchain)', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${CAT}/api/rating/${DOC_ID}`);
      return [
        [status === 200 && json.success === true, `rating stats 200 (${status})`],
        [['db', 'onchain'].includes(json.source), `source present (${json.source})`],
        [typeof json.average === 'number' && typeof json.count === 'number', `average/count numeric (${json.average} / ${json.count})`],
      ];
    }
  },
  {
    id: 'b26-rating-prepare-externalId', group: 'subblog-rating', name: 'subblog: POST prepare (no txHash) resolves via hub externalId', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${CAT}/api/rating/${DOC_ID}`, 'POST', {
        wallet: BUY, rating: 40, hubContentId: DOC_ID,
      });
      return [
        [status === 200 && json.success === true, `prepare 200 (${status})`],
        [!!json.onchain?.contentHash && json.onchain.ratingValue != null, `onchain payload present (${!!json.onchain?.contentHash}, ${json.onchain?.ratingValue})`],
      ];
    }
  },
  {
    id: 'b26-rating-prepare-wrongType', group: 'subblog-rating', name: 'subblog: POST prepare rejects out-of-range rating', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${CAT}/api/rating/${DOC_ID}`, 'POST', {
        wallet: BUY, rating: 99,
      });
      return [[[400, 422].includes(status), `bad rating → ${status} (${json?.code || json?.error || ''})`]];
    }
  },

  // ---- Subblog admin/owner authz completeness (anon must be rejected) ----
  {
    id: 'b26-authz-access-control-put', group: 'subblog-authz', name: 'subblog: PUT access-control rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${CAT}/api/nibgate/posts/${DOC_PATH.slice(6)}/access-control`, 'PUT', { whitelist: [] });
      return [[[401, 403].includes(status), `anon PUT access-control → ${status}`]];
    }
  },
  {
    id: 'b26-authz-access-control-del', group: 'subblog-authz', name: 'subblog: DELETE entitlement rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${CAT}/api/nibgate/posts/${DOC_PATH.slice(6)}/entitlements/${BUY}`, 'DELETE');
      return [[[401, 403].includes(status), `anon DELETE entitlement → ${status}`]];
    }
  },
  {
    id: 'b26-authz-revoke', group: 'subblog-authz', name: 'subblog: POST revoke rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${CAT}/api/nibgate/posts/${DOC_PATH.slice(6)}/entitlements/${BUY}/revoke`, 'POST', {});
      return [[[401, 403].includes(status), `anon POST revoke → ${status}`]];
    }
  },
  {
    id: 'b26-authz-settings-password', group: 'subblog-authz', name: 'subblog: PUT settings/password rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${CAT}/api/settings/password`, 'PUT', { password: 'x' });
      return [[[401, 403].includes(status), `anon PUT settings/password → ${status}`]];
    }
  },
  {
    id: 'b26-authz-link-hub', group: 'subblog-authz', name: 'subblog: POST settings/link-hub rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${CAT}/api/settings/link-hub`, 'POST', { siteId: 'x', token: 'y' });
      return [[[401, 403].includes(status), `anon POST link-hub → ${status}`]];
    }
  },
  {
    id: 'b26-authz-upload-get', group: 'subblog-authz', name: 'subblog: GET /api/upload is not a read surface (404)', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${CAT}/api/upload`);
      return [[[404, 405].includes(status), `GET upload → ${status}`]];
    }
  },
  {
    id: 'b26-authz-nonce-get', group: 'subblog-authz', name: 'subblog: GET nonce public', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${CAT}/api/auth/nonce`);
      return [[status === 200 && (json?.nonce != null || json?.message != null), `nonce GET → ${status} (${json?.nonce != null})`]];
    }
  },

  // ---- Subblog auth validation (no mutation) ----
  {
    id: 'b26-auth-register-bad', group: 'subblog-auth', name: 'subblog: register rejects malformed payload (no account created)', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${CAT}/api/auth/register`, 'POST', { email: 'not-an-email' });
      return [[[400, 422].includes(status) && /required|valid|must/i.test(json?.message || ''), `bad register → ${status} (${(json?.message || '').slice(0, 40)})`]];
    }
  },
  {
    id: 'b26-auth-login-bad', group: 'subblog-auth', name: 'subblog: login rejects malformed payload', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${CAT}/api/auth/login`, 'POST', { email: 'a@b.c', password: '' });
      return [[[400, 422].includes(status), `bad login → ${status} (${(json?.message || '').slice(0, 40)})`]];
    }
  },

  // ---- Hub rating externalId resolution (fix verification) ----
  {
    id: 'b26-hub-prepare-externalId', group: 'hub-rating', name: 'hub: prepare accepts subblog UUID via externalId', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${B}/hub/reputation/ratings/prepare`, 'POST', {
        contentId: DOC_ID, walletAddress: BUY, ratingValue: 4,
      });
      return [
        [status === 200 && json.success === true, `hub prepare → ${status} (${json.success})`],
        [!!json.contentHash && json.ratingValue != null, `hash + rating present (${!!json.contentHash}, ${json.ratingValue})`],
      ];
    }
  },
  {
    id: 'b26-hub-prepare-bad', group: 'hub-rating', name: 'hub: prepare rejects unknown contentId', pk: 'anon',
    run: async (h, { context }) => {
      const { status } = await jcall(context, `${B}/hub/reputation/ratings/prepare`, 'POST', {
        contentId: 'does-not-exist-anywhere', walletAddress: BUY, ratingValue: 4,
      });
      return [[[400, 404].includes(status), `unknown contentId → ${status}`]];
    }
  },
  {
    id: 'b26-hub-gateway-balance', group: 'hub-surface', name: 'hub: gateway/balance POST returns depositor balance', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jcall(context, `${B}/api/nibshare/gateway/balance`, 'POST', { address: BUY });
      return [
        [status === 200, `gateway balance → ${status}`],
        [/USDC/.test(json?.balance || ''), `balance formatted (${json?.balance})`],
      ];
    }
  },
  {
    id: 'b26-hub-widget-js', group: 'hub-surface', name: 'hub: /widget.js serves JS', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get('https://nibgate.xyz/widget.js');
      const ct = r.headers()['content-type'] || '';
      return [
        [r.status() === 200, `widget.js → ${r.status()}`],
        [/javascript/.test(ct), `served as JS (${ct})`],
      ];
    }
  },
];

module.exports = { name: 'batch26-untested-surface', checks };