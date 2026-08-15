# Design: Whitelist Access, Proofs, Entitlements, Revoke / Ban

**Status:** IMPLEMENTED (see §10 for resolved decisions).

How Nibgate decides *who may read a gated resource* (paid post, free-tier share,
invite-only blog), with fair semantics for `whitelist` edits, price changes,
`revoke`, `ban`, and `restore`. Covers the hub (nibshare) and subblogs/SDK on one
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
- **No refunds, by construction.** Revoke/ban flip *access*, never money. x402
  payments are one-shot irreversible transfers to the creator's wallet; there is
  no escrow, no chargeback, and no refund primitive. `revoke`/`ban` therefore do
  not (and cannot) return USDC — there is no "refund" feature to build on top.

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
  irreversible; build manual refund processes"). Nibgate does **not** build a
  refund process: access-control actions (`revoke`/`ban`) are purely entitlement
  flip, and money stays where it landed in the creator's wallet.
- **Webhook reality (Circle/PayAI/etc.): at-least-once delivery.** Replays of
  `cpn.payment.*` arrive on retry; side effects must be idempotent and deduped by
  event id. → §5 (receipt uniqueness).

## 3. Data model (entitlement is the source of truth)

Three records per grant, with a strict join invariant:

- **`Receipt`** — immutable proof of a *paid* purchase. `{ id, resourceId, wallet,
  amount, paymentNonce, status }`. `status ∈ { paid }`. (No `refunded`/`refundPending`
  states exist.) A receipt exists **iff** the wallet paid (`amount > 0`) for this
  resource. Free grants have *no* receipt.
- **`Entitlement`** — *current access state* for `(resourceId, wallet)`.
  `{ status ∈ { active, revoked, banned, expired }, source: 'paid' | 'free',
  grantedAt }`. One per `(resourceId, wallet)`, updated (not recreated) on every
  transition. This is what the access decision reads.
- **`Event`** — append-only audit log for admin actions & grant transitions
  (`view`, `revoke`, `ban`, `unlock`, `invite_only_flip`, `publish`; hub
  `NibShareEvent`, subblogs `BlogPostEvent`). Note: **only** those types are
  actually written today — there is no `restore`, `grant`, `price_change`, or
  `whitelist_flip` event in code on either rail (see §7).
- **`Proof`** — *not stored*. A short-TTL signed token derived from the
  entitlement, used only as a cheap transport for media/`<img>` requests. Its
  expiry never changes the access decision (it is re-minted on every legit visit).

**Invariants**

```
active && source='paid'  ⇔  ∃ receipt with amount > 0
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
encode. (Note: this table assumes a *non-expiring* share. If the share/post has an
`expiresAt`, the reachability gate returns `419` for **everyone** — including
existing paid entitlements — because it runs before any entitlement check. See
`assertReachable` in `backend/src/server/nibshare/controller.js`; verified live in
batch24.)

| # | Starting state                                               | Admin action           | Resulting access for a *prior non-whitelisted acquirer*                    |
|---|--------------------------------------------------------------|------------------------|----------------------------------------------------------------------------|
| 1 | paid post, wallet paid once                                  | (nothing)              | keeps forever (lifetime), across proof expiry & storage clears             |
| 2 | paid post, wallet paid once at $X                            | price → $Y (≠ X)       | keeps at $X (grandfathered terms)                                          |
| 3 | paid post, wallet paid once, later whitelisted               | (nothing)              | active-paid, kept                                                          |
| 4 | whitelist (free), wallet granted free                        | whitelist → removed    | keeps until last grant's proof-class term; must pay on fresh visit         |
| 5 | whitelist (free) → paid (price set), free grants exist       | price set              | served free until grant expiry, then 402 (no receipt exists)               |
| 6 | paid → free (price removed / whitelisted)                    | price removed          | everyone granted free per visit                                            |
| 7 | invite-only off → on, some paid non-whitelisted exists       | `publicAccess:false`   | **denied** (membership rule) — paid and now cut off (gap #11)              |
| 8 | invite-only on → off                                         | `publicAccess:true`    | prior paid-but-denied regain gate access (entitlement intact)              |
| 9 | active paid wallet                                          | admin `revoke`         | 403 "pay again"; can re-purchase                                           |
| 10 | active wallet (free or paid)                                | admin `ban`            | 403 everywhere, cannot re-purchase (rule 4 is hard)                         |
| 11 | revoked wallet                                              | admin `restore`        | entitlement back to `active` under its original source — **but no audit `Event` is written, and whitelist membership stripped by a prior `ban` is NOT restored** (see §7) |
| 12 | paid then banned, admin restores                             | `restore` after `ban`  | entitlement `active` again; on the hub the whitelist entry removed by `ban` is not re-added (invite-only access still denied), and no `Event` is written |
| 13 | free grant exists, admin sets price AND removes whitelist    | price set + whitelist off | served free till expiry; then 402 — *but* still membership-eligible (not invite-only) | — |

No cut-off state carries a refund: revoke/ban flip entitlements only, and money
already in the creator's wallet stays there (there is no refund primitive).

### Free vs paid gate mode (rule 3)

- `whitelistPrice` / `price` `> 0` → paid; free grants are impossible (except legacy
  free-then-flip, handled by rows 4–6).
- Price `= 0` or whitelisted → free gate: entitlement `source='free'`, no receipt,
  **re-granted each visit** (so `revoke`/`ban` still apply — they must also work on
  free grants, else a banned wallet resets by revisiting).
- Lifetime (rule 6) requires `source='paid'`, which requires `amount > 0` —
  **a free-tier grant is NOT lifetime** by construction.

## 7. Revoke / ban / restore

- **`revoke`** (`revokeEntitlement`): `entitlement.status='revoked'`. Wallet may
  re-purchase (rule 5) → new receipt, entitlement `active, source='paid'` again.
- **`ban`** (`banEntitlement`): `entitlement.status='banned'`. Hard deny (rule 4) —
  **cannot re-purchase**, unlike revoke. Reverting a ban is `restore` from the
  admin panel only.
- **`restore`**: entitlement back to `active` under original `source`. It does
  **not** re-add a whitelist entry that a prior `ban` stripped (hub behavior),
  and it does **not** write an audit `Event` on either rail.
- **No money moves in any of the above.** x402 payments are one-shot irreversible
  transfers to the creator's gateway wallet; there is no escrow and no chargeback.
  Revoking or banning a payer does not return their USDC — it only changes whether
  they may (re-)access the resource. If a creator wants to return funds, they send
  the transfer from their own wallet outside the platform.
- **Ban also strips the whitelist — hub only.** On the hub,
  `banEntitlement` removes the wallet from `share.whitelist[]`
  (`backend/src/server/nibshare/service.js`), so an invite-only share doesn't keep
  re-asserting the banned wallet on every policy save. The subblogs rail
  (`subblogs/backend/src/services/access.service.js`) does **not** strip the
  whitelist on ban — the entitlement check still blocks, but the wallet remains
  listed. This is a cross-rail asymmetry to reconcile (see §8).
- **Audit:** `revoke` and `ban` write an `Event` on both rails; `restore` writes
  none. `grant`, `price_change`, and `whitelist_flip` event types do not exist.

## 8. Parity across apps / SDK

Single rule §4 is evaluated by `canAccess` in the SDK, wired into both apps.
Each app keeps a thin fact-assembly wrapper — hub `canAccessShare`
(`service.js`), subblogs `canAccessPost` (`access.service.js`) — that reads the
entitlement + last receipt and calls the SDK rule. Controllers map the decision
to HTTP; the rule itself lives in exactly one place:

| Surface | Location | Rule implementation |
|--------|----------|---------------------|
| hub share page/API | `backend/src/server/nibshare/controller.js` (`accessShare`, `getShareMedia`, `unlockShare`) | `service.canAccessShare` (fact-assembly wrapper over SDK `canAccess`) |
| subblogs gate | `subblogs/backend/src/routes/v1/nibgate.route.js` (`serveAccess`, `mediaAccessResult`) | `accessService.canAccessPost` (fact-assembly wrapper over SDK `canAccess`) |
| SDK server | `packages/nibgate/src/server/access-policy.js` | `canAccess`/`accessDecision`/`effectivePrice` — the single rule, unit-tested |
| client | `packages/wallet/src/react/unlock.jsx` | proof persistence + `accessPathFor` (`?wallet=`) (done) |

Cross-rail divergences that remain on the *write side* (not the gate): ban strips
`whitelist[]` on the hub but not subblogs (§7), and `restore` writes no event on
either rail.

The SDK's own `accessFor`/`accessResponse` (`packages/nibgate/src/server/access.js`)
is a separate *stateless* embedded gate for SDK consumers without a database
(proof/price only) — deliberately lighter than §4, not a duplicate of it.

## 9. Claimed properties (what "done" means)

- No re-charge on proof expiry, storage clear, restart, or media subresource fetch.
- A replayed payment proof yields the stored receipt and zero new grants.
- `revoke` is effective immediately for the revoked wallet (no TTL window) — old
  proof is meaningless because rule 5 precedes rule 8.
- `ban` is harder than `revoke`: no re-purchase path; reversed only by `restore`.
- Every admin action that changes access writes an `Event`.
- Policy edits never secretly change prior terms for existing acquirers except the
  explicit membership (invite-only) exception in row 7 — which requires the
  automatic surface of paid-cut-off wallets (gap #11).

## 10. Open decisions — RESOLVED

1. **Gap #11 default**: on an invite-only flip, every active *paid* entitlement
   whose wallet is not in the (new) whitelist is revoked — no refund is possible
   or implied. Implemented in both `updateAccessPolicy` paths: when `publicAccess`
   flips to `false`, non-whitelisted active-paid wallets are revoked via the
   `revoke` rule. The response reports `cutOffWallets` so both admin UIs can warn
   before and surface the count after.
2. **Proof TTL on the hub**: **align to 12 h** (`DEFAULT_UNLOCK_SECONDS`), the same
   TTL subblogs already uses, for a single uniform rule across apps. Hub proofs get
   `iat`/`exp` claims; expiry is harmless because §4 rules 4–7 (entitlements) run
   before any proof check, and the client re-mints on every visit.
3. **Centralize §4 where?**: **the SDK** — pure module
   `packages/nibgate/src/server/access-policy.js` (all §4 helpers + `canAccess` +
   transition helpers), exported from `server/index.js` + `server.d.ts`. **STATUS:
   DONE** — the module is unit-tested and exported, and `canAccess` is wired into
   both backends via thin fact-assembly wrappers (`canAccessShare` on the hub,
   `canAccessPost` on subblogs).
4. **When a revoked wallet re-purchases**: treat as a **brand-new grant** (current
   behavior, kept). A fresh purchase is clean and gets a brand-new receipt +
   entitlement.