# Design: Nibgate × the Open Agentic Economy (Circle Vision Paper)

**Status:** ANALYSIS / PROPOSAL — nothing here is shipped yet except where noted.

Source: Circle, *Building the Open Agentic Economy* (2026-08-12),
`circle.com/blog/building-the-open-agentic-economy`. This document reads that paper
against Nibgate's existing code, records where Nibgate already implements its bar,
and proposes what to learn, adopt, or build. Companion to `ACCESS-CONTROL-DESIGN.md`
(access/entitlements) and `WALLET-STANDARD.md` (wallet/SIWE).

## 0. TL;DR

- The paper's core claim: the agent economy is won not by a curated marketplace but
  by an **open index + behavior-grounded ranking** ("trusted discovery ... is still
  missing"). Discovery is called "the capstone."
- The paper's accountability bar: ranking evidence must be **costly to fake**;
  ranking must obey five disciplines; a market is proven by the **stranger test**.
- Nibgate already meets parts of this bar in code (verified-receipt-only unlocks,
  onchain-proof-only ratings, permissionless inclusion, open read surface). The gaps
  are: no published ranking charter, no stranger-test e2e, reputation sybil
  hardening, agent identity (ERC-8004) alignment, and an open-signals surface.

## 1. The paper in one page

1. **Intelligence is the next internet primitive** (after webpages, APIs). Agents
   sell *work*, not access to a tool.
2. **The constraint shifts** from creating agents to **navigating the market they
   form** — buyers need discovery; new builders need distribution without a gatekeeper.
3. **AOL vs the open web**: curated catalogs (incl. Circle's Agent Marketplace,
   900+ services) grow only as fast as a curator reviews. The open web won via
   permissionless publishing + search.
4. **The stack**: identity (ERC-8004 agentId+agentURI) · value transfer
   (x402/MPP) · capability format (OpenAPI/agentURI) · settlement (stablecoins) ·
   reputation (**"registry live · signal missing"**) · validation · **trusted
   discovery (Missing)** — the capstone.
5. **Ranking must be grounded in observed behavior, not self-description.** Evidence
   must be costly to fake: payment volume alone can be manipulated, and
   self-declared onchain feedback is cheap to game.
6. **Five disciplines**: organic rank never for sale · inclusion permissionless ·
   read surface open · ranking contestable · ranking is not adjudication.
7. **The loop / stranger test**: publish → discover → pay → evidence → reputation →
   next discovery. Success = a genuine third-party stranger completes the loop in
   real traffic. "Open economies emerge; they are not announced."

## 2. Where Nibgate already sits in this stack

Mapped to code that exists today.

| Paper idea | Nibgate today | Location |
|---|---|---|
| Trusted discovery for paid content | Explore + open API + MCP + agent docs | `hub-routes.js:913` `/api/hub/explore/content`, `mcp.js`, `openapi.js`, `frontend/public/discovery.md` |
| Evidence costly to fake (unlocks) | Only **verified receipts** (x402 gateway / direct-transfer, `paymentId` present) count as unlocks | `helpers.js:898-914` |
| Evidence costly to fake (revenue) | Revenue summed only from verified receipts; when no onchain txHash, only receipts `< 100` count (anti-inflation) | `helpers.js:904-914` |
| Evidence costly to fake (ratings) | Only ratings with `status='accepted'` **and** `proof` starting `onchain:` count; monitors sweep rejects proof-less ratings | `helpers.js:920-925`, `monitors.js:262` |
| Reputation is proof-gated | Rating contract stores `unlockRef`; hub only indexes ratings matched to unlock eligibility | `contracts/NibgateReputation.sol:61`, `helpers.js:903` |
| Permissionless inclusion | Verified-site indexing, no marketplace gate; curation sits on top of the index | `helpers.js` `resourcesFromManifest`, hub routes |
| Open read surface | Public API, MCP tools, `llms.txt`, `discovery.md` | `mcp.js`, `openapi.js`, `frontend/public/discovery.md` |
| Capability / machine-readable format | `nibgate.json` manifest, per-post manifest, `<link rel="alternate">`, `Link` header, JSON-LD, `data-nibgate-*` | `discovery.md:33-42`, subblogs `nibgate.route.js` |
| Per-task payment | Pay-once-per-resource unlock; no subscriptions | SDK `unlock.mode = 'one_time'` |
| Ranking not adjudication / no funds held | Nibgate verifies unlocks, never holds funds; no escrow/refund primitive | `ACCESS-CONTROL-DESIGN.md` §1 |

## 3. Gaps and what to do about them

Prioritized. Each item names the paper's principle it serves and the concrete work.

### P0. Adopt and publish the ranking charter (paper: five disciplines)

Nibgate's trending sort is implicit code — `views + unlocks*4 + revenue*20`
(`hub-routes.js:954`), plus `best-sellers` (unlocks, revenue) and `hot-new`. That
formula is *the ranking methodology* and should be public so ranking is contestable.

**Do:**
- Write the five disciplines into the agent-facing docs (`frontend/public/discovery.md`,
  `llms.txt`) and here.
- Publish the trending formula and the signal inputs it reads
  (views / unlocks / revenue / receipts / ratings / reputationScore — all already
  returned by `serializeContent`).
- Add an explicit statement: **organic rank is never for sale; any future paid
  placement is labeled and separate** (a guardrail, not a feature today).

### P1. Stranger test as a committed e2e (paper: "stranger test", first complete turn)

The paper's bar: a genuine third party completes discover → pay → rate → re-rank
in real traffic. Nibgate's e2e harness already simulates stranger wallets; make the
full loop an enforced check.

**Do:** add an e2e that asserts, with a brand-new funded wallet:
1. discover via `GET /hub/explore/content?sort=trending` and find a paid resource,
2. unlock it through the access endpoint (verified receipt recorded),
3. prepare + submit an onchain rating (`POST /hub/reputation/ratings/prepare` →
   `rateContent`),
4. the rating row lands with `status='accepted'` and `proof` prefixed `onchain:`,
5. Explore re-ranks / the resource reputation changes.

### P1. Reputation sybil hardening (paper: "combine multiple behavior-grounded inputs and defenses")

Known attack against today's model: cheap $0.01 unlock → 5-star self-rating from a
throwaway wallet. Existing defenses are good but singular.

**Do:**
- **Spend-weighted ratings**: a rating's weight scales with verified USDC paid
  (`receipt.amount`) for that `unlockRef` — cheap sybils barely move the mean.
- **Rating eligibility bound to a verified receipt**: require the submitted
  `unlockRef` to map to a `status='verified'` receipt with `amount > 0` before the
  hub accepts/indexes the rating (already implied by `helpers.js:903`, make it
  enforced at accept time, not just display time).
- **Recency decay**: weight behavior signals (unlocks, ratings) by age so reputation
  reflects ongoing behavior (PageRank framing) rather than a one-time spike.
- Document the defense-in-depth matrix (see §5).

### P2. Open signals / contestability surface (paper: "ranking is contestable", "read surface is open")

`serializeContent` already returns views/unlocks/revenue/ratings/reputationScore.
Expose the raw substrate explicitly so a second ranker can re-rank the same data.

**Do:** add a per-content `signals` block (or `/hub/explore/content/:id/signals`)
with the raw inputs the ranking reads — views by type, verified unlock count,
receipt count, revenue, accepted rating distribution, last activity — and document
that anyone can re-derive ranking from them.

### P2. Agent identity forward-compat (paper: ERC-8004 agentId + agentURI)

Nibgate treats "agents" as anonymous wallets today. The paper's identity primitive
is ERC-8004 (`agentId` + `agentURI`). Design (not build) for agents to self-describe
so nibgate can distinguish human vs agent unlock/rating signals in reputation.

**Do:** write a short design note (§6) covering how the SDK server entrypoint and
Nibshare could attach an `agentURI` (→ OpenAPI) to unlocks/ratings, and how that
would feed a separate agent-reputation dimension later.

### P3. Nibshare as a paid-endpoint publishing path (paper: "deploy a paid agent as easy as publishing a website"; "ours is never the only door")

Nibshare is already a no-domain publishing rail. The paper explicitly invites other
publishing paths. Nibshare is the natural seed for "publish a paid *capability*
(OpenAPI-described endpoint), not just content," which agents discover and pay per
call.

**Do:** no code now; record as a product direction in §6 and keep the manifest/agent
self-description surface extensible toward OpenAPI/agentURI.

### P3. Capability-format alignment (paper: capability format = the agent economy's "HTML")

Nibgate's manifests are its HTML. Aligning the manifest schema surface
(`nibgate.json`, per-post manifest, `data-nibgate-*`, JSON-LD) toward OpenAPI /
`agentURI` lets paid content endpoints read as callable capabilities to agents.

**Do:** map the current manifest fields to OpenAPI/agentURI concepts in §6 so a
future serializer can emit both without breaking existing consumers.

## 4. Non-goals (what the paper implies Nibgate should NOT do)

- **No paid placement in Explore.** Organic rank is never for sale (P0 guardrail).
- **No curation as a gate.** Verified-site indexing is the floor; curation sits on
  top of the index, never in front of it.
- **Ranking is not adjudication.** Nibgate describes the world; it does not judge
  disputes or hold funds. Already true (no escrow/refund primitive,
  `ACCESS-CONTROL-DESIGN.md` §1).
- **No agent marketplace.** Staying an open index + unlock layer, not a storefront
  with a staff-curated catalog.

## 5. Reputation defense-in-depth matrix

| Attack | Existing defense | Proposed defense |
|---|---|---|
| Sybil rating from throwaway wallet | Rating requires accepted onchain proof | Spend-weighting; verified-receipt-bound eligibility |
| Cheap unlock → fake stars | `serializeContent` counts verified receipts only | Enforce `amount > 0` verified receipt at accept time |
| Self-rating on own content | `unlockRef` matched to unlock receipt | Require distinct payer≠recipient receipts; velocity limits |
| Volume inflation (unlock counts) | Revenue capped when no onchain proof | Keep; extend to unlock count if cheap mints appear |
| Reputation pump then dump | none | Recency decay; rolling-window signals |

## 6. Design notes (forward-compat, not shipped)

### 6.1 Agent identity (ERC-8004)

Sketch: SDK server entrypoint and Nibshare attach optional
`agentId`/`agentURI` to unlock and rating events. The hub stores an
`AgentIdentity` table keyed by wallet/address + `agentURI`, and reputation can later
split human vs agent dimensions. No contract change required; ERC-8004 registries
already live per the paper.

### 6.2 Nibshare as paid-capability publishing path

Sketch: a Nibshare of `type: 'service'` carries an OpenAPI/agentURI description +
price per call; access policy reuses `canAccess` (`packages/nibgate/src/server/access-policy.js`)
unchanged; agents discover via Explore and pay per call via x402. This reuses the
entire existing gate/payment/reputation stack.

### 6.3 Manifest → OpenAPI/agentURI mapping

| Nibgate field | OpenAPI/agentURI concept |
|---|---|
| `content.id`, `path`, `url` | `agentId`, operation path |
| `price`, `currency` | x402 payment requirement (already emitted in `PAYMENT-REQUIRED`) |
| `accessPolicy` (humans/agents) | `securitySchemes` / allowlist |
| `unlockPolicy.mode` | operation cost model (one-time vs per-call) |
| manifest `<link rel="alternate">` + JSON-LD | `agentURI` discovery link |

## 7. Where the work lands (file map)

| Item | File(s) |
|---|---|
| Ranking charter + published methodology | `frontend/public/discovery.md`, `backend/src/server/routes/hub-routes.js` (formula), `llms.txt` |
| Stranger-test e2e | `e2e/` (see existing harness + `prod-matrix*`) |
| Spend-weighted ratings + verified-receipt-bound eligibility + recency decay | `backend/src/server/hub/helpers.js`, `backend/src/server/hub/monitors.js`, reputation ingest route |
| Open signals surface | `backend/src/server/routes/hub-routes.js`, `backend/src/server/openapi.js`, `mcp.js` |
| Agent identity design | SDK event shape (`packages/nibgate/src/`), hub schema (future) |
| Nibshare paid-capability direction | `backend/src/server/nibshare/` (design only) |