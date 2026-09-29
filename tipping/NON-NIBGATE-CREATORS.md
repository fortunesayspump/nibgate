# Nib Tip — tipping for non-Nibgate creators

How tipping works when the creator has never heard of Nibgate. Companion to
`SPEC.md` (protocol) and `FEES.md` (cuts). Status: live on both nets.

## The problem

A payer wants to tip a specific piece of content on an ordinary site. No
widget, no SDK, no wallet on the receiving end. The tip must still land with
the right human, eventually, without the payer doing homework.

## Parties

- **Payer** — human (extension) or agent (API, Dr. Nib). Has USDC + a wallet.
- **Creator** — owns the content, unknown to Nibgate, may never have touched crypto.
- **Protocol (hub)** — resolves, holds, releases. Takes a cut for the service.

## Flow

1. **Tip intent.** Payer names content (URL + extracted title/author) and amount.
   SDK: `createTipIntent({ url, title, amount })`.
2. **Resolution.** `resolveTipRecipient(url)` cascade:
   - Hub index hit (domain claimed before, or content fingerprinted before) → known wallet.
   - Page signals (author meta, `rel=me`, canonical, payment pointers) → candidate wallet + confidence.
   - Nothing solid → **unresolved**.
3. **Resolved → pay direct.** Gateway or direct-transfer rails, same as unlocks.
   Receipt recorded (`type: 'tip'`). Done.
4. **Unresolved → hold.** The tip settles into **protocol holding**: a no-key,
   deterministic per-domain on-chain box (`TipHoldingFactory`), keyed by
   canonical domain, indexed in the backend ledger. The payer pays now; the
   creator claims later. No hub custody, no shell address, no expiry.
5. **Discovery.** Creator learns about held tips via: extension badge on their
   own site ("you have N tips waiting"), hub lookup by domain, or word of mouth.
6. **Claim.** Creator verifies site ownership (widget / DNS / terminal flow —
   same as hub site verification) and proves wallet control; the hub keeper
   then releases the domain box (net minus the held-tier cut) to their wallet.
   Claiming to a non-owner wallet additionally requires a signed claim token.
7. **After claim.** Future tips for that domain route direct. Creator may stay
   fully off-SDK (hub-hosted tip endpoint, destination = their wallet) or
   install the SDK (lower cut, self-hosted).

## Edge policy (v1 decisions)

- **Minimum tip:** dust below the floor is rejected at challenge time (dust
  costs more to track than it pays).
- **Attribution drift:** pages change. Holds match on canonical domain first,
  content fingerprint second. A tip always belongs to at most one domain.
- **Double claim:** one verified wallet per domain. Re-verification by the same
  wallet is idempotent; a different wallet claiming an already-claimed domain
  goes to manual review, never auto-release.
- **Unclaimed holds never expire.** No sweep, no deadline. A tip owed is owed
  indefinitely until claimed or refunded. (Deliberate policy: expiry would
  turn real gifts into protocol revenue.)
- **Payer refunds.** The payer can reclaim unclaimed tips in full (no fee) any
  time before release, via a signed refund request; the hub verifies no release
  occurred and relays the on-chain refund. Refunds are ledger-recorded and
  netted from tip counts.
- **Author vs site owner:** tips default to the verified site owner. Author
  splits stay a future revenue story (per-article `recipientWallet` already
  exists on content rows if demand appears).
- **Identity:** hub accounts now; ERC-8004 agent/creator identities later.

## Why this converts

The claim moment is the funnel: a creator owed real money finishes
verification in minutes because there is a balance waiting. Every claim is a
registered creator, every registered creator is future direct volume. The
higher non-member cut pays for resolution + custody + the funnel itself.
