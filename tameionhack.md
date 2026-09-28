# TAMEION — Nibgate build plan

Tameion Agents Hackathon (Canteen × Circle), Sep 27 – Oct 10. AI agents that
manage a business's money, settled in USDC on Arc. Judging: 30% agency,
30% traction, 20% Circle stack, 20% innovation — on the **delta during the
window**. Build rules (branches, no pushes before Sep 30): see `HACKATHON.md`.

## Thesis

> **Nibgate makes internet content economically addressable by humans and agents.**

Every content item — on a Nibgate site or any URL on the web — resolves to a
payable creator. Humans tip through the extension, agents through the API,
research agents through budgets. One protocol, three interfaces:

```text
                    NIBGATE
                       |
          ┌────────────┴────────────┐
          |                         |
       HUMAN                     AGENT
          |                         |
  Browser Extension          skill.md / API
          |                    Dr. Nib (budgeted)
          └────────────┬────────────┘
                       |
                 Nibgate Protocol
                       |
             ┌─────────┴─────────┐
             |                   |
          Unlock               Tip
```

Product names: **Nib Tip** (protocol/API), **Extension** (human UI),
**Dr. Nib** (agent UI). Under all three: **JEV**, the decision layer.

> **LLMs generate. JEV decides. Nibgate pays.**

## 1. Nib Tip (protocol/API) — the foundation

Extends the unlock model (`content → pay → unlock`) with tipping
(`content → value found → tip creator`). Content never needs to be locked.

- **Addressable unit is the content, not the URL.** A tip is
  `{site, contentUrl/path, contentHash?, title, amount, payer}`. Nibgate sites
  link onto existing `Content` rows; external content is URL + extracted
  metadata + hash.
- **Claiming is site-level.** Verify once (widget / terminal / hub link),
  claim everything. Verification mints the creator an agent-managed wallet
  (Circle Wallets) — a creator never needs to understand crypto to receive money.
- **Unclaimed tips accrue per-domain** in backend-ledger holding, released on
  verification. Disclosed as protocol-held, not escrowed on-chain (v1 scope).
- **Pricing:** higher protocol cut for non-Nibgate content — Nibgate provides
  the monetization infrastructure (resolution + custody), not just processing.
- **Rails:** Gateway + direct-transfer x402, same as unlocks. Testnet +
  mainnet from day one (`NIBGATE_NETWORK`-aware).
- **Surfaces:** SDK (`@nibgate/sdk`), nibshare, subblogs, raw API.

### Creator resolution cascade (who gets paid for an arbitrary URL)

1. Nibgate-registered site/content → known wallet.
2. Page signals → author meta, canonical, `rel=me`, byline.
3. LLM-inferred recipient + JEV confidence score.
4. Below threshold → hold as pledge, do not pay.

## 2. Extension (human interface)

Opens on any article/tutorial/paper/research page, identifies **the specific
content** (not just the site), resolves the creator, injects tip UI
($0.25 / $1 presets + custom). Pays over the same Gateway/direct rails.
Ships unpacked + demo video (no store review in hackathon scope).

JEV judgments per page: is-this-content, creator identity, tipping
appropriateness, recipient, suggested amount.

## 3. Dr. Nib, PhD (agent interface)

A research agent with a **user-funded USDC budget** (Circle Wallets) that
autonomously acquires information that costs money:

1. Budget in → plan.
2. Search Nibgate index + web → candidate sources.
3. LLM proposes actions per source: buy / tip / skip / cross-check / stop.
4. JEV decides under budget, relevance, uniqueness, reputation, confidence.
5. Nibgate-locked → unlock; external + justified → tip; redundant → skip.
6. Synthesize cited report (PDF export stretch).
7. Every spend logged in a visible **decision trace** (see below).

Registered on **ERC-8004** (Arc) as a payment-capable agent identity
(verify registry availability in prep; cut if absent).

Tipping is NOT mandatory per source — Dr. Nib pays only when JEV judges the
acquisition justified by objective + budget. Economic agency, not auto-pay.

## 4. JEV (decision layer)

LLM proposes possibilities; JEV makes constrained decisions between them.
Pure logic, no LLM inside, money-agnostic — shared by tipping, extension,
Dr. Nib, metadata autofill, and hub ranking.

Decision record: `{options[], scores{}, policy, action, reasons[], budgetDelta}`.
Actions include `escalate` (low confidence / over threshold → human), so
autonomy is bounded by policy, not prompts.

Decision trace (shown, not chain-of-thought):

```text
Source #4 · Cost $0.18 · Relevance high · Overlap low · Quality high
Action → UNLOCK — high-value information with low redundancy.

Source #7 · Cost $0.30 · Relevance medium · Overlap 82%
Action → SKIP
```

## Money flow (testnet for the event)

Hackathon scope is **testnet only**: faucet USDC, `eip155:5042002`,
`testnet-*` hosts, testnet APIs. All new code stays `NIBGATE_NETWORK`-aware
via the existing helpers so mainnet is a config flip, not a rewrite —
but nothing hackathon-related is wired to, verified on, or demoed with
mainnet until after the event. **Mainnet launch happens post-hackathon**
(contracts + keeper + mainnet env flips then).
- Dr. Nib budgets are real balances in agent wallets on whichever network
  the deployment targets.

## Traction plan (real counterparties, in-window)

- Creators tipped during rehearsals = onboarded businesses.
- 5–10 bloggers with the extension installed during the window.
- Nib Tip API used by at least one external developer/app.
- Metrics: businesses onboarded, tips sent, unlocks, USDC volume moved,
  decisions made vs escalated.

## Killer demo (3 min)

1. Fund Dr. Nib's $3 budget on camera (deposit into agent wallet).
2. Open an ordinary article → extension identifies it → tip $0.10.
3. Ask Dr. Nib to research X on $3 remaining budget.
4. Watch sources appear; JEV unlocks ($0.20), tips ($0.10), rejects redundants.
5. Cited research doc lands + closing screen: budget, spent, sources,
   paid/unlocks/tips split.

## Build order

JEV core → Nib Tip API → extension thin client → Dr. Nib (consumes all three).
ERC-8004 + PDF are stretch. Open questions: ERC-8004 registry on Arc;
author-vs-publication tip splits (post-hackathon revenue story).

## Hosting (testnet scope — nothing new is provisioned pre-event)

| Piece | Runs where | Infra needed |
|---|---|---|
| JEV core | library — bundled into callers, no hosting | none (zero-dep Node) |
| Nib Tip API | new routes on the **existing** testnet hub backend (`nibgate-blog-testnet` Railway service) | none new; same DB, same deploy |
| Extension | nowhere (distributed) + static review page | none; store listing post-event |
| Dr. Nib chat UI | new routes in the **existing** testnet hub frontend (Vercel project) | none new |
| Dr. Nib runner | **new** Railway service in `nibgate-testnet` project (long-lived agent loop + budget wallet) | one service + agent wallet, created at build time |
| Dr. Nib state | **new** Postgres in `nibgate-testnet` (sessions, memory, budget ledger, traces) | one PG; references hub content IDs, never joins hub tables |
| Tip holding ledger | testnet hub Postgres (new tables via Prisma migrate) | migrate on deploy |

Rules: no new databases (extend testnet ones), no new Vercel projects,
one new Railway service max (Dr. Nib runner). Everything else rides existing
deploys. Mainnet hosting decisions happen post-hackathon.

## Repo structure (new convention)

New feature areas live top-level, next to `subblogs/` — never nested four
deep. `tipping/` (this plan's spec home), `extension/`, `dr-nib/`, `jev/`.
`backend/src/server/nibshare/` predates the convention and stays put until
post-hackathon (moving it now risks the green deploys for zero user gain);
queue the move then. Specs live with their feature (`tipping/SPEC.md`,
not scattered).
