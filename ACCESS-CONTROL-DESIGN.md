# Design: Whitelist Access, Proofs, Entitlements, Revoke / Ban / Refund

**Status:** IMPLEMENTED (see §10 for resolved decisions).

How Nibgate decides *who may read a gated resource* (paid post, free-tier share,
invite-only blog), with fair semantics for `whitelist` edits, price changes,
`revoke`, `ban`, and refunds. Covers the hub (nibshare) and subblogs/SDK on one
rule, and fixes the two defects found this session (the 12h re-charge bug on
proof expiry, and the media gate ignoring entitlements).

## 0. The two bugs this design fixes (verified this session)

1. **Proof expiry caused re-charging.** Unlock proofs expire at
   `DEFAULT_UNLOCK_SECONDS = 60*60*12` (`packages/nibgate/src/server/proof.js:5`).
   After expiry, `verifyUnlockToken` → `null`, and `serveAccess` fell through to
   the *payment* branch → a wallet that already paid got re-charged on re-visit.
   Same class of bug on the hub (`backend/src/server/nibshare/controller.js`), where
   hub proofs never expire but a returning paid user with cleared localStorage
   got a fresh 402. **Fix:** entitlements are the source of truth; proof expiry is
   orthogonal (see §4).
2. **Media gating ignored entitlements.** `<img>`-style media proxies gated only on
   a bearer proof; a wallet with an active paid entitlement but whose proof expired
   (or whose localStorage was cleared) was 403'd. **Fix:** media access falls back
   to the wallet address (`?wallet=`) and honors the active-paid entitlement.

## 1. Design goals

- **Pay once, access while offered.** A wallet that honestly paid under the terms
  offered at the time keeps access under those terms forever (proof expiry,
  localStorage clears, restarts must not re-charge).
- **Access is decided by an entitlement record, not by a token's freshness.**
  A proof is a *convenience* (cheap authz for `<img>`/media), never the source of
  truth. Revocation is therefore immediate and DB-backed (no waiting on TTLs).
- **Deterministic, fair transition rules** for every policy edit the admin can make
  (`whitelist` free→paid, `price` up/down, `publicAccess` invite-only flip,
  `revoke`, `ban`, `restore`).
- **Idempotent payments** — one x402 proof buys exactly one grant, replays safe
  (Attack II / replay is the #1 x402 production failure mode; see §5).
- **Refund bookkeeping is explicit and auditable.** Revoking someone who paid is a
  refundable action. `refunded` is marked on the receipt; actual on-chain return is
  a separate, manual/later step (x402 has no native refund; see §7).

## 2. Grounding: what actually matters in practice (researched)

These are the load-bearing findings behind the design. Full reasoning lives in the
relevant docs; the decisions that flow from them are flagged inline.

- **x402 replay / double-grant is the dominant real-world failure.** An arXiv study
  ("Five Attacks on x402 Agentic Payment Protocol", 2026-05) measured **248 grants
  per single payment** on a live endpoint when the server lacked an idempotency
  record keyed to `(pay_id, resource_id)`: the chain settles once (nonce/nonce-used
  bit), but the HTTP side can grant `n` times for one payment. The fix is a
  **pre-grant claim** on `(pay_id, resource_id)` before serving — exactly-once
  semantics at the HTTP boundary. → §5.
- **Token expiry and revocation are orthogonal concerns** (Duende, Auth0, GitHub
  docs, CIAM Compass): expiry bounds staleness; revocation is *intentional*
  pre-expiry invalidation and *requires shared state* (a revocation list / DB), not
  a magic token. You cannot revoke a stateless bearer token. → $4 / §6.
- **x402 payment requirements should expire** (PayAI guide, wrappedx402 hardening):
  short `validBefore`/TTL (120–300 s) prevents stale-price replay. We already mint
  challenges server-side with a TTL; keep it. → §5 (binding).
- **x402 has no native refunds** (PayAI guide: "blockchain transactions are
  irreversible; build manual refund processes"). Bookkeeping-refund on a receipt is
  the honest way to represent "we revoked what you paid for". → §7.
- **Webhook reality (Circle/PayAI/etc.): at-least-once delivery.** Replays of
  `cpn.payment.*` arrive on retry; side effects must be idempotent and deduped by
  event id. → §5 (receipt uniqueness).

## 3. Data model (entitlement is the source of truth)

Three records per grant, with a strict join invariant:

- **`Receipt`** — immutable proof of a *paid* purchase. `{ id, resourceId, wallet,
  amount, paymentNonce, status }`. `status ∈ { paid, refunded, refundPending }`.
  A receipt exists **iff** the wallet paid (`amount > 0`) for this resource. Free
  grants have *no* receipt.
- **`Entitlement`** — *current access state* for `(resourceId, wallet)`.
  `{ status ∈ { active, revoked, banned, expired }, source: 'paid' | 'free',
  grantedAt, refundedReceiptId? }`. One per `(resourceId, wallet)`, updated (not
  recreated) on every transition. This is what the access decision reads.
- **`Event`** — append-only audit log for admin actions & grant transitions
  (`grant`, `revoke`, `restore`, `ban`, `price_change`, `whitelist_flip`,
  `invite_only_flip`, `refund_mark`). Exists on hub (`NibShareEvent`) and subblogs
  (`Event` in `subblogs/backend/prisma/schema.prisma`).
- **`Proof`** — *not stored*. A short-TTL signed token derived from the
  entitlement, used only as a cheap transport for media/`<img>` requests. Its
  expiry never changes the access decision (it is re-minted on every legit visit).

**Invariants**

```
active && source='paid'  ⇔  ∃ receipt with amount>0, status in (paid, refundPending)
   (refunded receipt ⇒ entitlement must no longer be active-or-paid: revoked/banned)
revoked/banned          ⇒  NOT granted, regardless of any proof age
expired                 ⇒  the grant would be re-granted free on next visit (no receipt)
```

## 4. The access decision (one rule, both apps)

`canAccess(resource, wallet?, proof?)` — evaluated on every gate (page render,
media, document, agent):

```
1. INVENTORY    post/mode active?                else deny
2. MEMBERSHIP   whitelist / invite-only?         see §6.1
3. GATE MODE    free vs paid?                    see §6.4
4. HIGH PRIORITY BAN   entitlement.status='banned'        ⇒ deny (hard, cannot re-pay)
5. REVOKED       entitlement.status='revoked'    ⇒ deny + prompt re-purchase
6. ACTIVE PAID   entitlement.status='active' && source='paid'
                 ⇒ GRANT (regardless of proof age)
7. ACTIVE FREE   entitlement.status='active' && source='free'  && mode=gated
                 ⇒ GRANT (re-grant on next visit if expired)
8. PROOF HEURISTIC  valid untampered proof && not revoked/banned
                 ⇒ GRANT + lazily reconcile entitlement
9. else          ⇒ payment required (402 challenge)
```

Rules **4–7 run before proof checks** — this is the fix for defect #1. The proof is
only a fast-path for `rule 8` (freshly-minted same-visit proofs, media subresources
that can't carry headers).

Wallet resolution priority: explicit `?wallet=` → SIWE session → payment proof payer
→ `undefined` (charge path). Media proxies get `?wallet=` from the page's
`accessPathFor(path)` helper (`packages/wallet/src/react/unlock.jsx`).

**Possession rule (added this audit):** a bare `?wallet=` is a *claim*, never an
identity — it may pick a price tier but must not grant content. Granting paths (free
invite-only reads, lifetime re-issue, free-tier grants, media) require possession, i.e.
the claim matches the SIWE session wallet **or** a valid bound proof exists for it.
Invite-only paid shares refuse a non-whitelisted *possessed* payer before any charge.

### Proof design (a cache, not a key)

- Hub: HMAC `nibshare:{shareId}:{wallet}` (**never expires today**) → **add a
  mint-time claim**; the entitlements check makes expiry harmless.
- Subblogs: SDK-signed token, 12 h TTL. Keep the TTL (bounds replay surface) but
  **drop it from the decision path** (§4 rules 6–7 override an expired proof).
- A proof must be **bound** to `(resourceId, wallet)` — tampering with either must
  break verification (already true: HMAC/signed payload). Replay of a stale proof is
  safe because the entitlement check is the real gate.

## 5. Payment idempotency (anti-replay, one grant per payment)

The x402 relay boundary is the highest-risk spot (Attack II). Requirements:

1. **Pre-grant claim** — before granting access after a successful settle, atomically
   record `(paymentNonce/pay_id, resourceId) → receiptId`. On replay of the same
   proof → return the *stored* receipt response, do **not** grant again or create a
   second receipt. Implemented as a unique index on `Receipt.paymentNonce` (or a
   dedicated `PaymentClaim` row) + upsert, not a read-then-write.
2. **Challenge binding** — the challenge machine mints `amount/asset/network/route`
   server-side; the signed payment must match exactly (already true). Keep the
   challenge TTL short (120 s default) so a captured challenge can't be replayed
   at a future price.
3. **Receipt uniqueness** — `Receipt.id` is the idempotency key for downstream
   effects (reward/webhook/event). Every grant's effects key off `receiptId`, so
   at-least-once webhook redelivery is harmless.
4. **Lifetime grant is claim-keyed too** — the lazy entitlement re-issue in
   `serveAccess`/`accessShare` must itself be guarded by the receipt existence check
   (already is: `amount > 0`), not by "proof looked valid".

## 6. Policy-edit semantics (the "lot of combos" table)

Admin can edit anything at any time (edit stays enabled after publish). The
transition table — **one row per reachable state** — is the contract tests must
encode:

| # | Starting state                                               | Admin action           | Resulting access for a *prior non-whitelisted acquirer*                    | Refund? |
|---|--------------------------------------------------------------|------------------------|----------------------------------------------------------------------------|---------|
| 1 | paid post, wallet paid once                                  | (nothing)              | keeps forever (lifetime), across proof expiry & storage clears             | —       |
| 2 | paid post, wallet paid once at $X                            | price → $Y (≠ X)       | keeps at $X (grandfathered terms)                                          | —       |
| 3 | paid post, wallet paid once, later whitelisted               | (nothing)              | active-paid, kept                                                          | —       |
| 4 | whitelist (free), wallet granted free                        | whitelist → removed    | keeps until last grant's proof-class term; must pay on fresh visit         | — (free grant, no receipt) |
| 5 | whitelist (free) → paid (price set), free grants exist       | price set              | served free until grant expiry, then 402 (no receipt exists)               | — |
| 6 | paid → free (price removed / whitelisted)                    | price removed          | everyone granted free per visit                                            | — |
| 7 | invite-only off → on, some paid non-whitelisted exists       | `publicAccess:false`   | **denied** (membership rule) — paid and now cut off                         | **yes (gap #11)** |
| 8 | invite-only on → off                                         | `publicAccess:true`    | prior paid-but-denied regain gate access (entitlement intact)              | — |
| 9 | active paid wallet                                          | admin `revoke`         | 403 "pay again"; can re-purchase; receipt marked refunded/refundPending     | yes   |
| 10 | active wallet (free or paid)                                | admin `ban`            | 403 everywhere, cannot re-purchase (rule 4 is hard)                         | yes (paid) / n/a (free) |
| 11 | revoked wallet                                              | admin `restore`        | back to active under original terms (receipt refund-mark reversed)         | no    |
| 12 | paid then banned, admin restores                             | `restore` after `ban`  | active again per original terms                                             | —     |
| 13 | free grant exists, admin sets price AND removes whitelist    | price set + whitelist off | served free till expiry; then 402 — *but* still membership-eligible (not invite-only) | — |

**Gap #11 (the one open unfairness):** flipping to invite-only (row 7) cuts off
non-whitelisted payers *without* a refund. Design decision required — offered here,
default **no auto-refund** (manual/clerical refund via admin UI) to avoid
accidentally refunding people who were honestly offered and honestly cooked, but the
**admin UI must surface** "N paid non-whitelisted wallets will lose access" with an
optional "auto-mark refunded" toggle. (Recommendation: default to *bookkeeping-refund
those N receipts* — amounts are tiny, and it's the same rule as `revoke`.)

### Free vs paid gate mode (rule 3)

- `whitelistPrice` / `price` `> 0` → paid; free grants are impossible (except legacy
  free-then-flip, handled by rows 4–6).
- Price `= 0` or whitelisted → free gate: entitlement `source='free'`, no receipt,
  **re-granted each visit** (so `revoke`/`ban` still apply — they must also work on
  free grants, else a banned wallet resets by revisiting).
- Lifetime (rule 6) requires `source='paid'`, which requires `amount > 0` —
  **a free-tier grant is NOT lifetime** by construction.

## 7. Revoke / ban / refund

- **`revoke`** (`revokeEntitlement`): `entitlement.status='revoked'`; if the wallet
  has a `paid` receipt, that receipt → `refundPending` (or `refunded` if we actually
  returned funds). Wallet may re-purchase (rule 5) → new receipt, entitlement
  `active, source='paid'` again. Old receipt stays refunded (audit trail).
- **`ban`** (`banEntitlement`): `entitlement.status='banned'`; receipt refund-marked
  the same way. Hard deny (rule 4) — **cannot re-purchase**, unlike revoke. Reverting
  a ban is `restore` from the admin panel only.
- **`restore`**: entitlement back to `active` under original `source`; if it was
  `source='paid'`, the refund-mark on the receipt is **reversed** (this is
  bookkeeping, we can't actually claw back on-chain — document as such).
- **Refund is two steps by design**: (a) bookkeeping mark on the receipt (the "fair"
  part, immediate, atomic with the revoke/ban), (b) *actual* on-chain return
  (manual later, x402 has no refund primitive; PayAI/MagicStraw convention). The
  admin UI shows "refunded (booked)" vs "refunded (sent)" — avoids over-promising.
- **Audit:** every transition above writes an `Event` with actor + reason
  (`revoke`, `ban`, `restore`, `refund_mark`, `refund_reverse`).

## 8. Parity across apps / SDK

Single rule §4 must be mirrored in four places (all patched for the two defects
this session; the *structure* is what this doc pins):

| Surface | Location | Rule implementation |
|--------|----------|---------------------|
| hub share page/API | `backend/src/server/nibshare/controller.js` (`accessShare`, `getShareMedia`) | rules 4–7 + `?wallet=` fallback (done) |
| subblogs gate | `subblogs/backend/src/routes/v1/nibgate.route.js` (`serveAccess`, `mediaAccessResult`) | lifetime re-issue + `?wallet=` fallback (done) |
| SDK server | `packages/nibgate/src/server/{access,gateway,proof}.js` | decision should live here/`access.service.js` — currently duplicated in each app |
| client | `packages/wallet/src/react/unlock.jsx` | proof persistence + `accessPathFor` (`?wallet=`) (done) |

**Long-term:** hoist `canAccess` (§4) + the transition table (§6) into
`packages/nibgate/src/server/access.js` (or `packages/internal`) so hub and subblogs
*single-source* the rule. The PR that lands this doc's consensus should centralize
it — until then the two copies must stay in lockstep (the bugs this session were
exactly drift between them).

## 9. Claimed properties (what "done" means)

- No re-charge on proof expiry, storage clear, restart, or media subresource fetch.
- A replayed payment proof yields the stored receipt and zero new grants.
- `revoke` is effective immediately for the revoked wallet (no TTL window) — old
  proof is meaningless because rule 5 precedes rule 8.
- `ban` is harder than `revoke`: no re-purchase path; reversed only by `restore`.
- Every admin action that changes access writes an `Event`; refunds are receipt-marked
  and shown as booked-vs-sent.
- Policy edits never secretly change prior terms for existing acquirers except the
  explicit membership (invite-only) exception in row 7 — which requires the
  automatic surface of paid-cut-off wallets + optional auto-refund (gap #11).

## 10. Open decisions — RESOLVED

1. **Gap #11 default**: **auto bookkeeping-refund** the N cut-off wallets on an
   invite-only flip. Implemented in both `updateAccessPolicy` paths: when
   `publicAccess` flips to `false`, every active *paid* entitlement whose wallet is
   not in the (new) whitelist is revoked and its latest paid receipt marked
   `refunded` — exactly the `revoke` rule. The response reports `cutOffWallets`
   so both admin UIs can warn before and surface the count after.
2. **Proof TTL on the hub**: **align to 12 h** (`DEFAULT_UNLOCK_SECONDS`), the same
   TTL subblogs already uses, for a single uniform rule across apps. Hub proofs get
   `iat`/`exp` claims; expiry is harmless because §4 rules 4–7 (entitlements) run
   before any proof check, and the client re-mints on every visit.
3. **Centralize §4 where?**: **the SDK** — new pure module
   `packages/nibgate/src/server/access-policy.js` (all §4 helpers + `canAccess` +
   transition/refund helpers), exported from `server/index.js` + `server.d.ts`.
   Hub imports it live (workspace); subblogs backend gets it via a repacked
   `@nibgate/sdk` tarball (same flow as the wallet).
4. **When a revoked wallet re-purchases**: treat as a **brand-new grant** (current
   behavior, kept). The refund un-reverses the prior transaction, so a fresh
   purchase is clean and gets a brand-new receipt + entitlement.