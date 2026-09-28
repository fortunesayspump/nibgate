# Nib Tip — tipping for non-Nibgate creators

How tipping works when the creator has never heard of Nibgate. Companion to
`SPEC.md` (protocol) and `FEES.md` (cuts). Status: design, pre-build.

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
4. **Unresolved → hold.** The tip settles into **protocol holding**, keyed by
   canonical domain + content fingerprint (URL + title hash + snapshot hash).
   The payer pays now; the creator claims later. The hold is a backend-ledger
   entry (testnet scope), not an onchain escrow — disclosed as such.
5. **Discovery.** Creator learns about held tips via: extension badge on their
   own site ("you have N tips waiting"), hub lookup by domain, or word of mouth.
6. **Claim.** Creator verifies site ownership (widget / DNS / terminal flow —
   same as hub site verification), hub mints/associates their wallet (Circle
   Wallets, agent-managed), held tips release minus the protocol cut.
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
  indefinitely until claimed. (Deliberate policy: expiry would turn real gifts
  into protocol revenue.)
- **No refunds.** No payer clawback, ever — tips are gifts, stated at pay time.
- **Author vs site owner:** tips default to the verified site owner. Author
  splits are a post-hackathon revenue story, not v1.
- **Identity:** hub accounts now; ERC-8004 agent/creator identities later.

## Why this converts

The claim moment is the funnel: a creator owed real money finishes
verification in minutes because there is a balance waiting. Every claim is a
registered creator, every registered creator is future direct volume. The
higher non-member cut pays for resolution + custody + the funnel itself.
