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
  (generate → migrate deploy → serve).
- **Healthcheck Path:** `/health`.

> Note: `railway.toml`/config-as-code is deprecated on Railway; the settings
> above are set on the service directly, so the repository's
> `dr-nib/backend/railway.toml` is only a reference now.

The start command runs `prisma generate` → `prisma migrate deploy` → serve, so
the first deploy creates the `drnib` schema and later deploys apply new
migrations. Migration history lives in the `drnib` schema.

## 2. Environment variables

Set these on the service (never commit them):

| Variable | Value |
|---|---|
| `OPENROUTER_API_KEY` | the OpenRouter key — Dr. Nib's router **and** JEV decisions both use it |
| `HUB_DATABASE_URL` | the hub Postgres connection string (SIWE session lookups) |
| `DRNIB_DATABASE_URL` | same cluster, `...&schema=drnib` |
| `HUB_API_URL` | the deployed hub API origin, e.g. `https://api.nibgate.xyz` |
| `CORS_ORIGIN` | the deployed hub frontend origin, e.g. `https://nibgate.xyz` |
| `DRNIB_SERVICE_KEY` | random string; gates the MCP server. If unset the MCP surface runs open (dev only) |
| `TAVILY_API_KEY` / `EXA_API_KEY` | optional paid retrieval breadth; without them the run uses the free layer (arXiv + direct fetch) |
| `REDIS_URL` | optional; set to move stages onto BullMQ for durable/scalable execution |
| `SEARXNG_URL` | optional; a self-hosted SearXNG instance (see `ops/searxng/settings.yml`) joins the free search bench — no key, Google-grade breadth |
| `SEMANTICSCHOLAR_API_KEY` | optional free key; lifts the anonymous rate limit on paper search |
| `DRNIB_AGENT_PRIVATE_KEY` | optional; funds the agent spending wallet (tips, paid unlocks, x402). Without it the spend tools do not exist. Fund the derived address with USDC on the active network |
| `DRNIB_SPEND_MAX_TIP` | optional; per-tip ceiling in USD, default 1 |
| `DRNIB_SPEND_MAX_UNLOCK` / `DRNIB_SPEND_MAX_X402` | optional; per-call ceilings in USD, default 2 |
| `RAILWAY_API_TOKEN` | optional; enables the `run_code` sandbox tool (isolated ephemeral VMs for parsing, stats, scripts) |
| `RAILWAY_ENVIRONMENT_ID` | the environment sandboxes are created in (same project) |
| `DRNIB_SANDBOX_IDLE_MINUTES` | optional; sandbox idle TTL, default 10 |
| `PORT` | leave unset; Railway injects it |

Runtime knobs (optional, defaults are fine): `LLM_MODEL`, `LLM_FALLBACK_MODELS`,
`LLM_REASONING_EFFORT`, `VERIFY_SUPPORT_THRESHOLD`, `DRNIB_STAGE_LEASE_MS`.

## 3. Frontend

The hub UI stays at `nibgate.xyz/dr-nib`; only the **API** lives on its own
subdomain, `drnib.nibgate.xyz` (CNAME → the Railway service, TLS by Railway).
Because the subdomain is under `.nibgate.xyz`, the browser sends the SIWE
session cookie to it directly. `dr-nib-api.ts` defaults to that subdomain in
production; `next.config.ts` also exposes a same-origin `/drnib-api` proxy as a
fallback. Set `DRNIB_API_URL` only to point at a different deployment.

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
