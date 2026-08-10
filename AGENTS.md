# AGENTS.md

Guidance for AI coding agents working in this repo. Nibgate is a paid-content protocol: creators keep content on their own domains, Nibgate verifies sources, indexes public metadata and receipts, and enables x402 payments and on-chain reputation.

## Verify before you claim

Docs examples drift from the code quickly. Before writing or editing anything in `docs/`, verify every concrete claim against the code and, where possible, against live production responses (`https://api.nibgate.xyz`, `https://nibgate.xyz`, `https://www.nibgate.xyz`, creator subblogs like `pitchtalk.nibgate.xyz`). Examples that failed this rule: `?slug=` (route reads `?path=`), `import { gate }` (exports `createGate`), `nibgate.xyz/widget.js` (real host is `www.`), invented 402 envelopes, `stale`/`archived` site states, `?domain=` explore filter (it's `?q=`).

## Key facts that keep biting

- The subblog access route reads `req.query.path`, not `?slug=` (`subblogs/backend/src/routes/v1/nibgate.route.js:24`).
- The SDK exports `createGate` / `nibgate.gate(...)`. There is no bare `gate` import (`packages/nibgate/src/browser/index.js`).
- The widget lives at `https://www.nibgate.xyz/widget.js` (with www).
- Site verification checks the `data-nibgate-site` marker on the homepage; the token is validated at event time, not verification time.
- Site verification states: `pending`, `verified`, `missing_widget`, `failed`. There is no `stale` or `archived`.
- Site routes: `POST /hub/sites/register`, `POST /hub/sites/:websiteId/verify`, `DELETE /hub/sites/:websiteId`.
- `POST /hub/pay` takes `{ price, recipient, title }` only.
- Content rating contract signature: `rateContent(bytes32 contentId, uint8 rating, bytes32 reviewHash, string calldata unlockRef)`.
- `contentHash = keccak256("nibgate:content:v1|domain|externalId|url")` (`backend/src/server/hub/helpers.js:526`).
- MCP server is at `https://api.nibgate.xyz/mcp` (the main site proxies only `/api/*`).
- The hub serves an aggregate sitemap at `/all-content-sitemap.xml`.
- The main site is `nibgate.xyz`; the API is `api.nibgate.xyz`; docs are `docs.nibgate.xyz`.
- Nibshare is a PRIVATE sharing product: never emit its events to `/hub/evt` or index it in hub discovery/ledger/reputation — content expires within 7 days and has no creator-verified domain (`backend/src/server/nibshare/service.js`).
- Nibshare link manifest: `GET /nibshare/:slug/manifest` (also reachable at `GET /ns/<slug>`) returns the agent contract (built by `shareManifest()` in `backend/src/server/nibshare/service.js:126`); the share page advertises it via `nibgate:*` meta, JSON-LD, `data-nibgate-*`, `<link rel="alternate">`, and the `Link` response header (`frontend/src/middleware.ts`).
- Subblog per-post manifest: `GET /api/nibgate/manifest?path=/<type>/<slug>` (same root route as the site manifest, optional `req.query.path`), advertised by `<link rel="alternate">` + `Link` header on post pages (`subblogs/frontend/src/middleware.ts`). No `?slug=` anywhere.
- MCP tools: `explore_content`, `get_ledger`, `get_platform_stats`, `get_leaderboards`, `resolve_share` (slug or full `/ns/<slug>` URL) — all in `backend/src/server/mcp.js`. The MCP card lists them in `.well-known/mcp.json` on `api.nibgate.xyz`.

## Never reference `swarm/` in docs or committed files

`swarm/` (agent-wallet scripts, wallets) is gitignored on purpose. Do not mention it in `docs/`, `README`, or any committed file. For runnable examples, point to committed scripts: `demo/stress-test-agents.mjs` and `scripts/e2e-onchain-reputation-flow.mjs`.

## Commands

- Docs: `pnpm --filter docs build` (verify after any docs edit; page must prerender)
- SDK: `pnpm --filter @nibgate/sdk test`
- Backend dev: `pnpm --filter @nibgate/backend dev`
- Docs dev: `pnpm --filter docs dev`
- Frontend build: `pnpm --filter @nibgate/frontend build`
- Root test: `pnpm test`
- Backend has no test/lint script; verify changes with `node --check <file>`.

## Conventions

- Monorepo (pnpm workspaces). Packages: `@nibgate/sdk` (browser+server, publishes to npm), `@nibgate/internal`, `@nibgate/cli`, plus `backend/`, `frontend/`, `subblogs/`, `docs/`, `demo/`.
- Do not add comments unless asked.
- RPC: base/testnet URL is `https://rpc.testnet.arc.io`; the canteen URL is local-only config, never for docs.
- The on-chain rating fix in `backend/src/server/hub/helpers.js` (`upsertOnchainRatingForContent`) uses the resolved content row; keep that contract when editing.
- Docs use Nextra 4 `page.mdx` per-folder convention; the `_meta.ts` file maps nav labels.
