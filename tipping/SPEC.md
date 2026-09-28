# Nib Tip — protocol spec (local-only until Sep-30 freeze lifts)

Tipping any content on the internet, SDK-first. Status: `packages/nibgate`
re-exports from `@nibgate/sdk/server` the tip surface (`server/tip.js`:
`createTipChallenge`, `tipReceipt`, `createTipVerifier` with `verifyDirect` +
`verifyGateway`, `resolveTipPayee`, `createTipRequirement`,
`resolveTipRecipient`) and the holding surface (`server/holding.js`:
`mintHoldingAddress`, `buildHoldingRequirement`, `buildHoldingRelease`,
`submitHoldingRelease`, `deployHoldingBox`, `withdrawHoldingBoxGateway`,
`fundHoldingBox`, `mintClaimToken`/`verifyClaimToken`, `createTipIntent`), plus
`browser/tip.js` (`tipContent`). SDK tip+holding vitest green including revenue
parity and both-rails-pay-the-box. Hub endpoints (local-only, tested live on
testnet): `/hub/tips/challenge`, `/hub/tips/verify` (both rails), `/hub/tips`,
`/hub/tips/hold` (two-step: no proof → box-funding challenge, with proof →
held), `/hub/tips/held`, `/hub/tips/claim`, `/hub/resolve`, backed by the `Tip`
table (`settled`/`held`/`released`) and `TipDomainClaim` (one wallet per domain).
Proven end-to-end on testnet (real funds, both rails): a hold funds a no-key
domain box; the owner verifies and claims; the keeper runs
`release(domain, creator)` paying net minus the 500bps held-tier cut. Gateway
holds credit the box's Gateway ledger; the box implements ERC-1271, so the hub
keeper (or an on-demand claim) withdraws the credit onchain — no hub custody,
no shell address. Circle batch settlement is deferred, so a claim whose credit
has not settled returns `202 pending-settlement` and is retried. Claim requires
two proofs: site ownership (`verifyToken`) + wallet control (owner-link bound
wallet, or a signed `claimToken` to pay a different wallet). A second wallet
cannot re-claim a domain (409, manual review). Challenge carries the Circle
`extra` batching block + top-level `resource` required by the v3 gateway
client (also fixed for unlock challenges).
For the claimant side, see `NON-NIBGATE-CREATORS.md`. For cuts, see `FEES.md`.

## Model

A tip is `{ site, contentUrl, contentHash?, title, amount, payer, recipient?,
status }`. Statuses: `settled` (paid direct), `held` (protocol holding for an
unresolved/never-claimed creator), `released` (held → claimed), `refunded`
(payer-reclaimed before release, full amount, no fee). No `expired`: per policy
unclaimed tips never expire (see
`NON-NIBGATE-CREATORS.md`). Same receipt shape as unlocks with
`type: 'tip'`, so Explore, ledger, earnings, and reputation count tips with
no new machinery.

## Server (`@nibgate/sdk/server`)

```ts
// Full self-hosted flow — no hub account needed.
const nibtip = createNibTipServer({
  network: 'eip155:5042002',   // or 'eip155:5042'
  recipient: '0xCreatorWallet', // or (ctx) => resolveTipRecipient(ctx)
  protocolCutBps?: number,      // default per FEES.md
});

// POST /api/tip/challenge → { amount, payTo, network, expiresAt, policy }
// POST /api/tip/verify    → verifies Gateway receipt / direct transfer,
//                           returns { ok, proof, receipt }
```

Verification is pure cryptography + chain reads (same verifiers as unlocks).
A random blogger sets a receiver wallet and accepts tips with zero Nibgate
relationship.

## Hub-hosted flow (no creator backend)

Creator sets a destination wallet on their hub dashboard (or at claim time).
Payers hit the hub tip endpoint; the hub runs the SDK flow server-side and
takes the hosted cut. Same pattern as hub-hosted unlocks (`hub/pay`).

```text
POST /hub/tips/challenge  { contentUrl, title?, amount }
POST /hub/tips/verify     { payment proof... } → { ok, proof, receipt }
GET  /hub/tips/held?domain=X          (creator view of waiting tips)
POST /hub/tips/claim     { siteId, token } (release on verification)
GET  /hub/resolve?url=...             (creator resolution lookup)
```

## Creator resolution

```ts
resolveTipRecipient({ url, title?, authorHint? })
  → { wallet?, confidence, source }
// source: 'hub-index' | 'page-signal' | 'inferred' | 'unresolved'
```

Local signals first, hub lookup second, inference last. JEV consumes
`confidence` downstream (hold vs pay thresholds).

## Browser (`@nibgate/sdk` browser)

```ts
nibgate.tip({ url, amount, recipient? })  // tip flow with wallet UX
<NibTipButton resource={...} />           // drop-in component (subblogs, nibshare)
```

## Networks

All endpoints and helpers take `network` / read `NIBGATE_NETWORK` (server) and
`NEXT_PUBLIC_NIBGATE_NETWORK` (browser), defaulting to testnet. Testnet-only
until the post-hackathon mainnet launch.
