# Agent Marketing — Status

How Nibgate gets discovered by AI agents and the x402 ecosystem.

## The thesis

Agents don't see ads. They discover services through **registries, machine-readable docs, and ecosystem directories**.

## Live surfaces

| Surface | What | Status |
|---|---|---|
| MCP Registry | `io.github.fortunesayspump/nibgate` v0.2.1, remote `streamable-http` → `https://api.nibgate.xyz/mcp` | ✅ Live |
| x402 fan-out | `GET /.well-known/x402` — live paid resource URLs + instructions | ✅ Live, self-maintaining |
| OpenAPI spec | x-payment-info on paid paths, ownership proofs, securitySchemes | ✅ Live (v0.2.1) |
| llms.txt | Endpoint listed in `frontend/src/app/llms.txt/route.ts` | ✅ Live |
| discovery.md | Payer agent guide at `https://nibgate.xyz/discovery.md` | ✅ Live |

## Open items

1. **x402scan** — UI-only registration: https://www.x402scan.com/resources/register → submit `https://api.nibgate.xyz`
2. **Glama** — https://glama.ai/mcp/servers/new → sign in with GitHub → add MCP server URL `https://api.nibgate.xyz/mcp`
3. **PulseMCP** — https://www.pulsemcp.com/get-listed
4. **mcp.so** — auto-crawls MCP registry, verify weekly

## Rules

Any change to endpoints/pricing/flows propagates same-PR to: discovery.md, skill.md, openapi.js, mcp.js instructions, llms.txt. Version bumps sync openApiSpec.info.version ↔ MCP SERVER_VERSION ↔ `mcp-registry/server.json` + republish.
