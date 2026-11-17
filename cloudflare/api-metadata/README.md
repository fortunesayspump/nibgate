# API metadata at the edge

Prepared, not deployed. Existing API CNAMEs are DNS-only; the authenticated
Cloudflare DNS API returned 403 on both records. No DNS/security permission was
expanded and no Cloudflare resource or route was changed.

## Semantics

The generator invokes the actual backend's GET /mcp, GET /.well-known/mcp.json,
and POST tools/list handlers, and imports its OpenAPI export. It forbids fetch
and database queries during generation. Both network variants and a source hash
are committed. The build fails if regeneration differs; run live parity before
cutover. Protocol stays 2025-06-18, server/API version stays 0.2.15. No tools,
URLs, descriptions, fee behavior or API contract change, so registry/docs version
bumps are not needed. Coordinate future backend metadata releases with this
Worker; never change the pinned backend metadata without regenerating, comparing
and publishing the edge artifact. A build check alone cannot synchronize two
independently deployed releases.

Eligible anonymous requests without Origin/session/unknown headers:
- GET/HEAD /mcp and /.well-known/mcp.json.
- GET/HEAD /openapi.json and its existing /api/openapi.json alias.
- POST /mcp initialize, ping, tools/list and the existing empty 202 stateless
  initialized/cancelled notifications.

Everything else forwards once to the original URL, body and headers, preserving
upstream errors and redirects (manual redirect mode). No caching and no automatic
payment/write retries. Origin-bearing requests, OPTIONS, authorization, cookies,
MCP sessions, unknown headers, query strings, unknown protocol versions/methods,
malformed bodies and bodies above the 64 KiB classification budget all remain
on the backend. The backend's own 8 MiB limit and CORS/security handling therefore
remain authoritative. JSON classification has a 1.5-second deadline.

All tools/call executions are real. /.well-known/x402 queries live paid surfaces;
it is not frozen. Status/readiness, stats, ledger, auth, balances, paid access,
mutations, and other paths remain live. MCP ping reports only the same stateless
protocol liveness as before; it does not claim DB/payment readiness. No new
health endpoint is introduced. Public docs on existing frontend/docs Workers
already run at Cloudflare and are not changed by this API-only package.

## Verified and blocked

Node 22: eight edge test groups pass, including both-network metadata, IDs,
notifications, Origin/auth/session bypass, malformed/oversized input, true-call
forwarding, paths/queries, HEAD, preserved response/errors, and no retry.
Generation/check passes. Five metadata surfaces per network matched the live
Railway API exactly before cutover. Wrangler 4.164.0 dry-run passes (222.07 KiB, gzip 28.04 KiB; no bindings).
A local invocation of the prepared Worker forwarded one real explore_content
call to the live mainnet API exactly once and returned HTTP 200 with the original
JSON-RPC ID, success:true and one actual content record. This is not a deployed
Cloudflare-path test.
Full live edge routing, probe bypass, and edge-to-origin cold-wake tests cannot be
claimed until the DNS permission blocker is resolved.

Cloudflare account: 5168d18094624a42a2e019a74f50324b.
Zone nibgate.xyz: cd027bdd5438bc1a43aea893925616bc.
Current public DNS (17 November 2026):
- api.nibgate.xyz CNAME k2zpzu1m.up.railway.app (DNS-only).
- testnet-api.nibgate.xyz CNAME tcid69rk.up.railway.app (DNS-only).
The exact authenticated DNS IDs/settings are not readable under the current
OAuth scopes. Existing login permits workers_scripts/write, workers_routes/write
and zone/read, but DNS lookup returns 403. Do not refresh with indiscriminate
new scopes or expose tokens in logs/chat. Obtain scoped DNS read/edit access or
have an authorized operator perform the exact reviewed DNS step below.

## Ordered rollout after DNS access is available

1. Re-read both DNS records, zone SSL/security settings and Worker routes; retain
   exact prior values. Confirm strict origin TLS remains valid and no new paid
   subscription is required. Do not change security modes to make a probe pass.
2. Run from repository root with Node 22:
   `node cloudflare/api-metadata/generate.mjs --check`
   `node --test cloudflare/api-metadata/worker.test.mjs`
   `node cloudflare/api-metadata/check-live.mjs`
   `wrangler deploy --dry-run --config cloudflare/api-metadata/wrangler.jsonc`
3. Deploy the Worker initially without routes (`routes: []`, workers.dev false).
   It needs no secrets, DB binding, KV, Durable Object or paid feature.
4. Before proxying either API hostname, create its exact `host/*` route exclusion
   (`script: null`). This is REQUIRED: the existing *.nibgate.xyz/* creator Worker
   rejects reserved API hosts. Preserve all existing creator/hub/docs routes.
5. Attach only the four more-specific host routes in routes-plan.json to the new
   Worker, then enable proxied=true for the TESTNET CNAME without changing target,
   name or unrelated records. Null host/* exclusion keeps every other API route
   on the original origin path. Most-specific route precedence selects metadata.
6. Verify public metadata parity and edge source header, protocol IDs, allowed
   and denied Origin behavior, auth/session forwarding, unknown method/errors,
   malformed input, query/path handling, live x402/readiness and a real read-only
   tools/call. Confirm metadata probes do not appear in Railway HTTP logs; a real
   tools/call must appear and return actual data. Observe sleep using control-plane
   state, then make a safe real read to verify cold wake. Do not replay mutations.
7. Repeat the same checks for mainnet; keep testnet/mainnet metadata distinct.
   Never claim savings from edge headers alone; compare billed usage afterward.

## Rollback

Set only the changed API CNAME records back to their captured proxied=false
state, preserving targets. Keep the exact-host null exclusions while cached
Cloudflare DNS answers expire (observed public TTL 300 seconds). Remove only the
new metadata routes and those newly created exclusions after traffic returns to
Railway. Leave original wildcard/creator/hub/docs routes unchanged. The original
backend still implements every endpoint and needs no rollback or migration.
Disabling the metadata routes while leaving exact-host exclusions also restores
origin processing without a DNS change. Never remove exclusions while API hosts
are still proxied: the creator wildcard would intercept them.
