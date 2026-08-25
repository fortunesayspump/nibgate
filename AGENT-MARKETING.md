# Agent Marketing — Status & Checklist

How Nibgate gets discovered by AI agents and the x402 ecosystem. Update this file as items land.

## The thesis

Agents don't see ads. They discover services through **registries, machine-readable docs, and ecosystem directories**. Every item below feeds one of those three channels.

## Done

| Surface | What | Status |
|---|---|---|
| MCP Registry | `io.github.fortunesayspump/nibgate` v0.2.0, remote `streamable-http` → `https://api.nibgate.xyz/mcp` | ✅ Live since 2026-08-24. Republish on version bumps: edit `mcp-registry/server.json`, then `~/.local/bin/mcp-publisher publish` (GitHub auth cached). |
| x402 fan-out endpoint | `GET /.well-known/x402` returns `{version, resources[], instructions}` with live paid URLs (newest active nibshare + newest paid post from a verified site) | ✅ Live. Self-maintaining — queries DB per request. |
| OpenAPI spec | `/.well-known/x402` documented in `backend/src/server/openapi.js` | ✅ Live |
| llms.txt index | Endpoint listed in `frontend/src/app/llms.txt/route.ts` | ✅ Live |
| discovery.md | Payer agent guide + direct-transfer rail docs at `https://nibgate.xyz/discovery.md` | ✅ Live (commit 39c95bb) |
| coinbase/x402 ecosystem | PR #299 adds Nibgate under Services/Endpoints (`partners-data/nibgate`) | 🚧 PR open — https://github.com/coinbase/x402/pull/299 |

## Pending — needs Fortune (clicks only)

1. **Railway plan** — trial expired, blocks ALL future deploys (hub + subblogs). Pick a plan first or nothing else ships.
2. **x402scan registration** — UI-only, no API: https://www.x402scan.com/resources/register → submit `https://api.nibgate.xyz`. This is THE x402 indexer agents check.
3. **Glama claim** — https://glama.ai/mcp/servers → sign in with GitHub → claim `io.github.fortunesayspump/nibgate`. (Crawl hasn't picked us up yet.)
4. **Smithery** — requires `smithery.yaml` in repo root + `npx @smithery/cli publish` after GitHub login. Ask before doing: config format needs care.
5. **PulseMCP** — submission form: https://www.pulsemcp.com/get-listed

## Pending — auto/crawlers (verify weekly)

- **mcp.so** — crawls the MCP registry; still 404 for us. Recheck: `curl -o /dev/null -w "%{http_code}" https://mcp.so/server/nibgate`
- **Glama crawl** — may list us before manual claim lands.

## Rejected / low priority

- **GEO/AEO agencies** ($2k–10k/mo): optimize for LLM training data, not agent runtime discovery. Wrong channel for us.
- **Arch Tools directory**: validator prefers standard x402 well-known shapes; our Circle-Gateway-flavored challenges may bounce. Revisit if it becomes high-traffic.
- **outbid.lol pay-to-rank**: $5 tail slot, real visibility costs $50–300+. Manual Polar checkout. Parked.

## Circle ecosystem ("are we on circle marketplace?")

No marketplace exists. The real Circle/x402 surfaces:

- **Circle Nanopayments docs** (developers.circle.com/gateway/nanopayments) — we ARE the reference stack (`@circle-fin/x402-batching` buyer+seller). Angle: get featured as a builder showcase. Channel: Circle Developer Discord / developer relations contact.
- **Circle Alliance Directory** (partners.circle.com) — company-level Alliance Program membership. Heavyweight; park unless we want the badge.
- **BlockRun** (blockrun.ai) — x402 service discovery on Base; we're Arc testnet so fit is partial.
- **x402info.com/ecosystem** — free form, needs an email; submit when convenient.
- **x402.org/members** — membership program for the protocol itself; revisit post-mainnet.

## Rules of the road (from AGENTS.md)

Any change to endpoints/pricing/flows propagates same-PR to: discovery.md, skill.md, openapi.js, mcp.js instructions, llms.txt. Version bumps sync openApiSpec.info.version ↔ MCP SERVER_VERSION ↔ `mcp-registry/server.json` + republish.
