# Nib Tip — Product Design

Single source of truth for what Nib Tip is and how it works. Companions:
`SPEC.md` (protocol reference), `FEES.md` (cuts), `NON-NIBGATE-CREATORS.md`
(claimant funnel). Status: core proven live on testnet (real funds, both
rails wired, hold → claim → release, 100/100 SDK tests) — all local-only
until the Sep-30 freeze lifts.

## Problem

Someone wants to tip a specific post on an ordinary site. No widget, no SDK,
no wallet on the receiving end, creator may never have heard of Nibgate. The
tip must still reach the right human, eventually, without the payer doing
homework.

## Parties

- **Payer** — human (extension) or agent (API, Dr. Nib). Has USDC + a wallet.
  Never needs a Nibgate account.
- **Creator** — owns the content. May be crypto-native or never touched crypto.
- **Protocol (hub)** — resolves, holds, verifies, releases. Takes a cut.

## Core model

- Same x402 payment envelope as unlocks, both rails (direct USDC transfer,
  Circle Gateway — same verifiers as unlocks, money verification is
  rail-identical).
- A tip receipt is an unlock receipt with `type: 'tip'`. Grants no access,
  never inflates unlock counts (separate `Tip` table).
- **Revenue = unlocks exactly.** Fee-wallet payee resolution, 100bps default
  policy, split on distribute. No parallel fee machinery. Held tier charges
  more (claim machinery costs real money); see `FEES.md`.

## Resolution cascade

`resolveTipRecipient(url)` → `{ wallet?, confidence, source }`:

1. **Hub index** — domain claimed before, or content fingerprinted before.
2. **Page signals** — author meta, `rel=me`, canonical, payment pointers
   (passed as `authorHint`; extraction runs DOM-side in the extension).
3. **Inferred** — reserved for JEV-side scoring (not implemented).
4. **Unresolved** — hold path below.

JEV consumes `confidence` downstream (hold-vs-pay thresholds).

## Holding (unresolved recipients)

- **One money box per site**, minted (predicted) by the SDK from the site
  name — free until used. The payer funds it at tip time.
- **Both rails pay the box.** Direct rail lands onchain immediately. Circle
  batched settlement (gateway rail) is deferred and credits the box's Gateway
  *ledger*; the box implements **ERC-1271** (the same self-burn authorization
  as `GatewayFeeWallet`), so the hub keeper withdraws that credit onchain into
  the box at claim time. No shell address, no hub float, no custody.
- The box is a **no-key holding address**: funds sit onchain, visible to all,
  movable by nobody — not even us, no keys exist to steal. Only a verified
  claim triggers `release(domain, creator)` minus the cut. The ERC-1271 hook
  only authorizes an exact self-transfer of the box's own Gateway credit.
- No hub custody, ever. No expiry, no refunds (a tip owed is owed; expiry
  would turn gifts into protocol revenue). Dust below the floor is rejected
  at challenge time; holds require a named payer wallet.
- Attribution: canonical domain first, content fingerprint second. A tip
  belongs to at most one domain — never double-counted, never paid twice.
- No snapshots, no guesswork: page signals are never used for ownership
  decisions (spoofable, often absent). Whoever fairly verifies the domain
  first claims its waiting funds — accepted as unavoidable and rare. Genuine
  disputes go to manual review with offchain proof. Domain changes need no
  machinery.

## Claiming (hub-run)

1. Creator signs in with **Google or wallet**. First-timers get a pre-made
   **self-custodial, exportable embedded wallet** (Privy pattern) — no seed
   phrase, no extension, no crypto knowledge. Crypto natives bring their own.
2. **Two proofs, both required:**
   - *Site ownership* — install the SDK/widget (primary, same check the hub
     already does), else DNS TXT / file upload / platform proof (Substack
     and Medium can never run scripts, so the ladder is mandatory).
   - *Wallet control* — sign a canonical claim message, or be logged into
     the account that owns the wallet.
   Either alone is worthless; together they bind person + site + wallet.
3. **Claim to any wallet of choice.** Double-claim by a second wallet goes
   to manual review, never auto-release.
4. Release pays the box balance minus the cut. Future tips for a claimed
   domain route direct automatically via the hub index.

## Journeys

- **Stranger → hub claim → optional local SDK.** Claim links domain to
  wallet; installing the SDK with a tipping destination address + tip
  buttons anywhere upgrades them to direct, lower-fee tips.
- **Extension** detects SDK sites (widget script/attributes in DOM + hub
  lookup): rich direct flow on SDK sites, hold flow elsewhere, plus a
  "you have $X waiting" badge for creators browsing their own site.

## Site types

1. **Solo blogs/indie sites** — widget / DNS / file ladder + hold flow.
   **Verifier takes all.** Matches industry baseline; no creator loses a
   deal over it.
2. **Multi-creator sites** — v1 identical to solo (owner distributes
   manually, exactly what Substack forces today). Door stays open: content
   rows already carry an optional per-article `recipientWallet` that claim
   resolution prefers — no rebuild needed if real demand appears. Per-article
   author routing with site fallback + optional site cut is the designed
   upgrade, not built.
3. **Social** — deferred (platform policy risk before proven demand).
   Structure ready: recipient keys generalize from `domain:` to
   `farcaster:`/`lens:`/`x:`; adding a platform later = one resolver +
   one verifier, no core changes. Farcaster/Lens first (ownership onchain).

## Conversion layer (researched, proven)

- Presets $2–3 / **$5 highlighted default** / $10–15. Round numbers; never
  custom-only.
- Warm copy naming what money makes ("buy me a coffee," never "donate").
- Under bio + bottom repeat + inside best content. Missing/buried buttons
  earn zero.
- No payer accounts, ever (24% abandon on forced registration).
- Public tip counts + recent tips in extension (+43% lift via social proof).
- Thank-you loop: receipt screen + creator acknowledgment (retention
  30% → 84% across repeat gifts).
- Moments-based asks (milestones, drops, content endpoints), never begging.
- Measure tip conversion (0.5–1% healthy) + repeat-tipper rate (the signal).

## Sustainability

Volume × small cut. The waiting balance converts holders into registered
creators (highest-converting moment — Brave proved it with the same funnel);
converted SDK users generate direct volume at near-zero marginal cost.
Held-tier premium funds the claim machinery. Tips run 5–20% of creator
revenue when structured, ~zero when passive — our job is making the
structured path the default.

## Network model

Identity syncs testnet↔mainnet (sites, verification, owners, publishers,
profiles, editorial posts). Money and content never cross: every
content/ledger row carries its hub-stamped `network` tag, receipts whose
chain attests the other stack are rejected. Testnet money can never open
mainnet content.

## SDK surface: exists vs needed

Exists (`@nibgate/sdk/server`, re-exported):
- Tips (`server/tip.js`): `createTipChallenge`, `tipReceipt`,
  `createTipVerifier` (`verifyDirect` + `verifyGateway`), `resolveTipPayee`,
  `createTipRequirement`, `resolveTipRecipient`.
- Holding (`server/holding.js`): `mintHoldingAddress`, `holdingRecipient`,
  `buildHoldingRequirement`, `buildHoldingRelease`, `submitHoldingRelease`,
  `deployHoldingBox`, `withdrawHoldingBoxGateway` (ERC-1271 self-withdrawal via
  the shared fee-wallet machinery), `fundHoldingBox`, `mintClaimToken` /
  `verifyClaimToken`, `createTipIntent`, `holdingDeployment`.

Still needed for the full design above:
- `inferred` resolution source (JEV track).
- Domain-proof checkers (meta/DNS/well-known fetch + verify) — hub-side,
  extending the existing widget-check machinery (claim currently uses the
  hub's site `verifyToken` + wallet-control proof).

## Open items

Claim notifications (v1 = extension "waiting" indicator on held tips + hub
lookup; no email infra exists — User has no email field, no mail provider in
backend), extension/JEV wiring (contracts stable: confidence output + hub
endpoints; not yet consumed), creator docs, agent-doc propagation
(openapi/MCP/discovery/skill), ship (frozen till Sep-30).
