# Agent-facing surfaces — keep them in sync

Nibgate is heavily agent-facing. Machines discover, read, and pay Nibgate through the surfaces below. **Any change to endpoints, flows, pricing/fee behavior, or URL shapes MUST be propagated to every affected surface in the same PR** — stale agent docs are broken products for machines.

## The registry

| Surface | Source of truth | Live URL |
|---|---|---|
| Payer/consumer agent guide | `frontend/public/discovery.md` | https://nibgate.xyz/discovery.md |
| Creator SDK integration guide | `frontend/public/skill.md` | https://nibgate.xyz/skill.md |
| Agent skills index | `frontend/public/.well-known/agent-skills/index.json` | https://nibgate.xyz/.well-known/agent-skills/index.json |
| llms.txt index | `frontend/src/app/llms.txt/route.ts` | https://nibgate.xyz/llms.txt |
| llms-full.txt (flattened docs) | `frontend/src/app/llms-full.txt/route.ts` | https://nibgate.xyz/llms-full.txt |
| Docs llms.txt | `docs/src/app/llms.txt/route.ts` | https://docs.nibgate.xyz/llms.txt |
| OpenAPI spec | `backend/src/server/openapi.js` | https://api.nibgate.xyz/openapi.json |
| MCP server (tools + instructions) | `backend/src/server/mcp.js` | https://api.nibgate.xyz/mcp |
| MCP server card | same file, bottom | https://api.nibgate.xyz/.well-known/mcp.json |
| Site manifests (`/nibgate.json`) | `packages/nibgate` (manifest route) | `https://{creator-domain}/nibgate.json` |
| Nibshare meta/manifest | `backend/src/server/nibshare/service.js` | `https://api.nibgate.xyz/nibshare/{slug}/manifest` |
| Hub URL standard | `frontend/AGENTS.md` | canonical host is `api.nibgate.xyz`, bare `/hub/*` paths |

## Rules

1. **New endpoint → document it everywhere it belongs.** Public hub route? openapi.js + discovery.md (if agents use it) + llms.txt endpoint lists. New tool-shaped capability? Consider an MCP tool too.
2. **Changed flow → re-read the docs, don't patch from memory.** Grep `discovery.md`, `skill.md`, `mcp.js` instructions, and openapi descriptions for the touched concept before pushing.
3. **Tool/resource descriptions are prompts.** MCP tool descriptions, serverInfo instructions, and openapi summaries are what agents actually read — keep them precise, current, and action-oriented (include how to pay/unlock when relevant).
4. **Versions bump together.** `openApiSpec.info.version` and MCP `SERVER_VERSION` move in lockstep when either surface changes meaningfully.
5. **Verify live after deploy.** Curl the live URLs (not localhost) and confirm the new content is actually being served before calling the task done:
   ```bash
   curl -s https://api.nibgate.xyz/openapi.json | python3 -m json.tool | grep <new-thing>
   curl -s -X POST https://api.nibgate.xyz/mcp -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```
6. **Never use legacy URL forms in these files.** No `nibgate.xyz/hub/*`, no doubled `/api/hub/*` — see `frontend/AGENTS.md`.
7. **Machine parity is a guarantee, not a feature.** Docs may state that machine payers are recorded identically to browser users at the payment layer; keep that claim true.
