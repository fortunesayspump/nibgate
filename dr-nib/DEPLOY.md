# Deploying Dr. Nib (Railway)

Dr. Nib is a second service in the existing Nibgate Railway project. It shares
the Postgres cluster with the hub but keeps its own tables in a separate
`drnib` schema, and it reads the hub's SIWE sessions from the hub database.

## 1. Create the service

- **Source:** this repo.
- **Root Directory: the repo root** (not `dr-nib/backend`). `dr-nib/backend`
  depends on `@nibgate/internal` via `workspace:*`, which only resolves from the
  workspace root.
- **Railway Config File:** `dr-nib/backend/railway.toml` (sets the build watch
  patterns, the start command, and the `/health` healthcheck).

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
| `PORT` | leave unset; Railway injects it |

Runtime knobs (optional, defaults are fine): `LLM_MODEL`, `LLM_FALLBACK_MODELS`,
`LLM_REASONING_EFFORT`, `VERIFY_SUPPORT_THRESHOLD`, `DRNIB_STAGE_LEASE_MS`.

## 3. Frontend

The hub frontend reaches this service through `NEXT_PUBLIC_DRNIB_API_URL`. Set
it to the deployed service URL (or a same-origin proxy path) and redeploy the
frontend.

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
