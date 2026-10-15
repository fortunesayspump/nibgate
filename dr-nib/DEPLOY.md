# Deploying Dr. Nib (Railway)

Dr. Nib is a second service in the existing Nibgate Railway project. It shares
the Postgres cluster with the hub but keeps its own tables in a separate
`drnib` schema, and it reads the hub's SIWE sessions from the hub database.

## 1. Create the service

Deployed as `nibgate-drnib-mainnet` in the `nibgate-mainnet` project (production
environment). Its service settings, mirroring the hub backend because Dr. Nib
needs the monorepo's `workspace:*` deps:

- **Source:** GitHub repo `fortunesayspump/nibgate`, branch `main`.
- **Root Directory:** *(repo root)* — not `dr-nib/backend`. The build context
  must be the repo root so pnpm resolves the workspace; the start command is
  scoped to the package instead.
- **Start Command:** `pnpm --filter @nibgate/dr-nib-backend start:prod`
  (generate → serve; no schema changes during startup).
- **Healthcheck Path:** `/health`.

> Note: `railway.toml`/config-as-code is deprecated on Railway; the settings
> above are set on the service directly, so the repository's
> `dr-nib/backend/railway.toml` is only a reference now.

The start command generates the Prisma client and starts the API. Fresh installs
must provision the `drnib` schema before serving traffic. Schema upgrades require
a separate, reviewed maintenance step against the correct `DRNIB_DATABASE_URL`:
inspect migration status and SQL, confirm backups and authorization, then apply
the approved migrations before deploying code that requires them. Migration
history lives in the `drnib` schema. Startup never runs migrations or `db push`.

### Testnet mirror (full testnet flow)

The testnet frontend (`testnet.nibgate.xyz/dr-nib`) renders the app and
proxies `/drnib-api` to `https://drnib.testnet.nibgate.xyz` (unless
`DRNIB_API_URL` overrides it). For the full testnet flow that host must serve
a testnet dr-nib deployment:

- **Railway service** in the testnet project (same repo/branch, root directory
  = repo root): `pnpm --filter @nibgate/dr-nib-backend start:prod`.
- **Env**: the §2 table, but `HUB_API_URL=https://testnet-api.nibgate.xyz`,
  `CORS_ORIGIN=https://testnet.nibgate.xyz`, `DRNIB_NETWORK=testnet`,
  `DRNIB_DATABASE_URL=…&schema=drnib` on the testnet cluster, and testnet keys.
  Do NOT set `DRNIB_MAINNET_ONLY`. Do NOT copy mainnet keys.
- **DNS**: `drnib.testnet.nibgate.xyz` CNAME → the Railway service (TLS by
  Railway). Until this resolves to the service, the testnet UI renders but its
  API calls fail.
- **Verify**: `curl -s https://drnib.testnet.nibgate.xyz/health` → `{"ok":true,…}`.
- **Deploy trigger (known gap):** pushes to `main` do NOT auto-build the
  testnet service (mainnet auto-builds fine). After pushing, trigger
  manually: `railway service source connect --repo
  fortunesayspump/nibgate --branch main --service nibgate-drnib-testnet`
  from a directory linked to the testnet project — the reconnect kicks a
  fresh build of current `main`. Verify in `railway deployment list`.
- **SearXNG (testnet):** service `nibgate-searxng-testnet`
  (`searxng/searxng:latest`, private-only, no public domain) with a volume
  mounted at `/etc/searxng` holding a `settings.yml` that enables the JSON
  API (`search.formats: [html, json]` — stock defaults 403
  `?format=json`). Wire via `SEARXNG_URL=http://nibgate-searxng-testnet.railway.internal:8080`
  on the drnib service. (There is no `ops/searxng/settings.yml` in the
  repo — the live file lives in that volume; back it up before re-creating
  the service.)

## 2. Environment variables

Set these on the service (never commit them):

| Variable | Value |
|---|---|
| `OPENROUTER_API_KEY` | the OpenRouter key — Dr. Nib's router **and** JEV decisions both use it |
| `LLM_MODEL` | generation model (bulk writing). Pinned cheap, e.g. `~google/gemini-flash-latest`. JEV decisions are separate and unaffected |
| `LLM_SMART_MODEL` | judgement-heavy generation (intake questions, plans, round reviews). Defaults to the `typesafe/jev-router`; override for a full swap |
| `LLM_FALLBACK_MODELS` | comma-separated failover models, e.g. `~openai/gpt-mini-latest,openai/gpt-4o-mini` |
| `HUB_DATABASE_URL` | the hub Postgres connection string (SIWE session lookups) |
| `DRNIB_DATABASE_URL` | same cluster, `...&schema=drnib` |
| `HUB_API_URL` | the deployed hub API origin, e.g. `https://api.nibgate.xyz` |
| `CORS_ORIGIN` | the deployed hub frontend origin, e.g. `https://nibgate.xyz` |
| `DRNIB_SERVICE_KEY` | high-entropy, server-only bearer credential; grants trusted service access to runs for any named wallet. Never give it to browser clients or untrusted agents. Production rejects MCP calls if unset; local development can run open with a warning. |
| `TAVILY_API_KEY` / `EXA_API_KEY` | optional paid retrieval breadth; without them the run uses the 11-index free layer (SearXNG when configured, GDELT, Wikipedia, OpenAlex, Semantic Scholar, Crossref, EDGAR, Stack Exchange, HN, Polymarket, arXiv) + direct fetch + OpenRouter web search over the existing LLM key |
| `REDIS_URL` | optional; set to move stages onto BullMQ for durable/scalable execution |
| `SEARXNG_URL` | optional; a self-hosted SearXNG instance joins the free search bench — no key, Google-grade breadth. Must serve `?format=json` (stock images 403 it; see Testnet mirror above for the volume procedure) |
| `SEMANTICSCHOLAR_API_KEY` | optional free key; lifts the anonymous rate limit on paper search |
| `DRNIB_AGENT_PRIVATE_KEY` | optional; funds the agent spending wallet (tips, paid unlocks, x402). Without it the spend tools do not exist. Fund the derived address with USDC on the active network |
| `DRNIB_SPEND_MAX_TIP` | optional; per-tip ceiling in USD, default 1 |
| `DRNIB_SPEND_MAX_UNLOCK` / `DRNIB_SPEND_MAX_X402` | optional; per-call ceilings in USD, default 2 |
| `RAILWAY_API_TOKEN` | optional; enables the `run_code` sandbox tool (isolated ephemeral VMs for parsing, stats, scripts) |
| `RAILWAY_ENVIRONMENT_ID` | the environment sandboxes are created in (same project) |
| `DRNIB_SANDBOX_IDLE_MINUTES` | optional; sandbox idle TTL, default 10 |
| `DRNIB_DISABLED` | optional kill switch; `1`/`true` = answer 503 on every run route (health stays up). Flip per service to pull the backend off a stack without a code change |
| `DRNIB_NETWORK` | `mainnet`; stated explicitly (otherwise inferred from `HUB_API_URL`) |
| `DRNIB_SELLER_ADDRESS` | optional; receiver for direct x402 tips/unlocks |
| `DRNIB_SPENDER_ADDRESS` | optional; route direct USDC tips through `NibgateSpender` (daily cap + fail-secure allowlist) instead of the raw EOA. Testnet `0x903b0606da40d99d78da9d9be6c435acacba5cf0`. Leave unset for the EOA path |
| `ESCROW_CORE` / `ESCROW_SPLITTER` | escrow is not auto-enabled on mainnet: set both to the deployed ERC-8183 core + `NibgateRunSplitter` addresses. Testnet defaults are built in |
| `ESCROW_KEEPER_KEY` | keeper hot key (escrow evaluator + `submit`/`complete` + split attestation). **Required for `isEscrowConfigured()`**; also read from `NIBGATE_KEEPER_PRIVATE_KEY`. Without it the escrow routes answer 501 |
| `ESCROW_TREASURY` | optional; default `0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12` |
| `OPENROUTER_SEARCH_ENGINE` | optional; web-search engine override, default `exa` (forced because native provider search annotates redirect URLs, not real pages). Single-model call, no `models[]` failover; ~$0.007 + tokens per search, circuit-broken like other providers |
| `ESCROW_FEE_BPS` | optional; default 100 (1%) |
| `ESCROW_OPERATOR` | operator payee for the split (receives ledger-attested spend). Required for onchain settle — without it settle skips with an event and funds wait for manual `POST /:id/escrow/complete` |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` | optional; exports storage (same bucket conventions as hub media) |
| `PORT` | leave unset; Railway injects it |

Runtime knobs (optional, defaults are fine): `LLM_MODEL`, `LLM_FALLBACK_MODELS`,
`LLM_REASONING_EFFORT`, `VERIFY_SUPPORT_THRESHOLD` (default 0.6 — claim support bar), `DRNIB_STAGE_LEASE_MS`.

Escrow funding rule (enforced, not configurable): approve needs the job Funded
for at least the plan estimate; deposits are one-shot (no top-ups); the
working cap aligns down to the deposit. Estimates include a $0.03 verify stage.

## 3. Frontend

The hub UI stays at `nibgate.xyz/dr-nib`; only the **API** lives on its own
subdomain, `drnib.nibgate.xyz` (CNAME → the Railway service, TLS by Railway).
Because the subdomain is under `.nibgate.xyz`, the browser sends the SIWE
session cookie to it directly. `dr-nib-api.ts` defaults to that subdomain in
production; `next.config.ts` also exposes a same-origin `/drnib-api` proxy as a
fallback. Set `DRNIB_API_URL` only to point at a different deployment.

Per-deployment UI toggle (Vercel, no code change):
`NEXT_PUBLIC_DRNIB_ENABLED=false` renders an "unavailable" notice instead of
the app; unset (or anything else) means on. Flip it on the mainnet and/or
testnet frontend projects independently and redeploy — public `NEXT_` vars
bake in at build time. The dr-nib backend the UI talks to follows the build
network unless `DRNIB_API_URL` overrides it: mainnet builds →
`drnib.nibgate.xyz`, testnet builds → `drnib.testnet.nibgate.xyz` (which must
exist — see Testnet mirror above).

## 4. Verify after deploy

```bash
curl -s https://<drnib-service>/health
curl -s https://<drnib-service>/mcp                      # server card
curl -s -X POST https://<drnib-service>/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A run needs `OPENROUTER_API_KEY` to generate and JEV to decide; without the key
a run parks at its first decision by design (it never fabricates).


Production readiness: `/health` exposes `research.acceptingRuns`, network and escrow configuration. A production mainnet service without escrow refuses new runs and approvals; the composer offers the testnet preview. Keep at least 0.02 native USDC in the settlement keeper before accepting new deposits. Pending terminal-run settlements retry every minute (three per sweep), including jobs already completed with an unexecuted split. Receipts label refunds pending until the split is confirmed.

### Arc mainnet escrow deployment gate

The Hub's published MCP (`https://api.nibgate.xyz/mcp`) and Dr. Nib's service-key MCP (`https://nibgate.xyz/drnib-api/mcp`) are separate servers. Deploying escrow contracts does not by itself open mainnet research.

Build and test the contracts, then run `scripts/deploy-drnib-escrow.mjs` with `DRNIB_ESCROW_DRY_RUN=1` and a prospective `DRNIB_ESCROW_KEEPER_ADDRESS` to inspect Arc chain ID, bytecode, signer, constructor values, and gas. For broadcast, run it with the existing mainnet `NIBGATE_DEPLOYER_PRIVATE_KEY` and `NIBGATE_KEEPER_PRIVATE_KEY` in the process environment. The script requires the signer to match `contracts/deployments/arc-mainnet.json`, checks gas balance with a 50% buffer, verifies both deployed contracts onchain, and records addresses and transaction hashes. Do not copy keys into the repository, terminal arguments, or chat. It refuses to redeploy an already recorded escrow.

On 15 Oct 2026, the mainnet API and worker were wired with `ESCROW_CORE`, `ESCROW_SPLITTER`, `ESCROW_KEEPER_KEY` (a Railway reference to the existing mainnet Hub keeper), and `ESCROW_OPERATOR`. The keeper was topped up to more than 0.10 native USDC, and both direct and hub-proxied `/health` returned `acceptingRuns: true` and `escrowReady: true`. A complete mainnet funded lifecycle, reject/refund route parity, wallet-button soak, and external security review remain open checks; do not describe those as verified until recorded in `TESTS.md`.
