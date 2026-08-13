# Nibshare API

Base URL: `https://api.nibgate.xyz` (backend); share pages at `https://nibgate.xyz/ns/<slug>`.

Short-link suffix `slug` is an 8-char base58 string as the share's stable id on the
public page. The DB keeps `slug @unique` and `id` (uuid) as the internal key.

## Auth

Requests that create or manage shares use a Nibgate **session cookie** (`auth_session`)
issued by the nonce-based SIWE (EIP-4361) wallet login
(`packages/internal/src/auth.js`). Owner-only routes check that the session wallet owns
the share. Authentication is cookie-based; there is no bearer-token mode.

## Creating a share

`POST /nibshare` (cookie auth)

```
{
  "title": "My notes on x402",
  "summary": "gated notes",
  "content": { "type": "article", "markdown": "# hi", "media": [ { "storageRef": "nibshare/...bin", "encryptedKey": "<base64>", "contentType": "image/webp", "name": "pic.png", "size": 1234 } ] },
  "coverUrl": "https://pub-...r2.dev/nibshare/.../preview.webp", // optional public preview
  "price": "1.00",                     // public USDC price; "0" = free
  "whitelistPrice": "0.00",            // optional USDC for whitelisted wallets; null/blank = same as price
  "publicAccess": true,                // false = invite-only (only whitelisted wallets may unlock)
  "expiresAt": "2026-08-05T00:00:00Z", // optional, null = never (capped at 7 days)
  "whitelist": [ "0xabc...", "0xdef..." ], // optional; empty = no tier members
  "storageProvider": "nibgate",        // only "nibgate" is supported today
  "contentType": "text"                // legacy: "text" for plain bodies
}
```

Pricing tiers: whitelisted wallets pay `whitelistPrice` when set (0 = free for them),
everyone else pays `price`. `publicAccess=false` makes the share invite-only regardless of
price — non-whitelisted wallets get 403 before any payment.

`content` is either:

- a plain string (legacy text body), or
- an object `{ type: 'article', markdown, media }` where `media` is an array of
  encrypted media items produced by `POST /api/uploads/content?encrypted=1`
  (`{ storageRef, encryptedKey, contentType, name, size }`).

Encryption is always **server-side**: the server generates the content key
(`generateContentKey`), encrypts with AES-256-GCM, and stores the ciphertext at
`nibshare/{id}/body.bin` in R2. No plaintext ever reaches storage, and no key is vended
to the browser. The client-side-encrypt mode from earlier design docs was **not
implemented**.

Success:

```
201 Created
{
  "id": "uuid",
  "slug": "9aB3cD4e",
  "url": "https://nibgate.xyz/ns/9aB3cD4e",
  "title": "My notes on x402",
  "coverUrl": "...",
  "price": "1.00",
  "expiresAt": null,
  "storageProvider": "nibgate",
  "storageRef": "nibshare/<id>/body.bin",
  "ciphertextUrl": "https://pub-...r2.dev/nibshare/<id>/body.bin",
  "contentHash": "0x..."
}
```

Any `storageProvider` other than `nibgate` is rejected with
`only the nibgate storage provider is supported yet`.

## Uploading media

`POST /api/uploads/content?encrypted=1` (multipart, cookie auth)

Accepts images, audio, video, and documents. Images are optimized to WebP first
(sharp: rotate, ≤2560px, q90), then AES-256-GCM encrypted and stored as a
`.bin` ciphertext blob.

```
200
{
  "success": true,
  "storageRef": "nibshare/<userId>/enc/media/...bin",
  "encryptedKey": "<base64>",
  "contentType": "image/webp",
  "name": "original.png",
  "size": 12345,
  "encrypted": true,
  "previewUrl": "https://pub-...r2.dev/nibshare/<userId>/public/preview/...webp" // images only
}
```

`previewUrl` is a public plaintext WebP (used for the share card / social preview) and
must be stripped before storing the item in `media`. Without `?encrypted=1` the route
stores a plaintext public blob and returns `{ url }` — used only for non-gated assets.

## Meta (public)

Anyone can fetch metadata — never the body.

`GET /nibshare/:slug/meta`

```
200
{
  "title": "My notes on x402",
  "summary": "gated notes",
  "coverUrl": "...",
  "price": "1.00",
  "whitelistPrice": "0.00",       // null = no tier
  "publicAccess": true,
  "currency": "USDC",
  "contentType": "text",
  "expiresAt": null,            // null = never expires (capped at 7 days)
  "createdAt": "...",
  "whitelist": true,            // boolean: has a non-empty whitelist
  "status": "active",
  "viewCount": 0,               // lifetime views
  "unlockCount": 0,             // lifetime unlocks
  "revenue": 0                  // unlockCount * price (USDC)
}
```

## Manifest (machine-readable contract)

`GET /nibshare/:slug/manifest`

The canonical agent-facing contract for a share: pricing, expiry, status, counts, and the
URLs an agent needs to evaluate and read it. Same shape is embedded in the server-rendered
share page as `nibgate:*` meta tags, JSON-LD, and `data-nibgate-resource` attributes.

```
200
{
  "schema": "https://docs.nibgate.xyz/nibshare-manifest",
  "version": 1,
  "kind": "nibshare",
  "slug": "...",
  "title": "...",
  "summary": "...",
  "contentType": "text",
  "price": "1",
  "whitelistPrice": "0",          // null = no tier
  "publicAccess": true,
  "currency": "USDC",
  "expiresAt": null,
  "status": "active",
  "createdAt": "...",
  "viewCount": 0,
  "unlockCount": 0,
  "urls": {
    "page": "https://nibgate.xyz/ns/<slug>",
    "meta": "https://api.nibgate.xyz/nibshare/<slug>/meta",
    "manifest": "https://api.nibgate.xyz/nibshare/<slug>/manifest",
    "access": "https://api.nibgate.xyz/ns/<slug>",
    "unlock": "https://api.nibgate.xyz/nibshare/<slug>/unlock",
    "media": "https://api.nibgate.xyz/nibshare/<slug>/media/{kind}?index=N"
  },
  "payment": { "scheme": "x402", "description": "..." }
}
```

## Access (server-side body)

`GET /nibshare/:slug/access`

Also mirrored on the API host at `GET /ns/:slug` (the short pay/read URL an agent can
use straight from a `https://nibgate.xyz/ns/<slug>` link). Both routes behave identically.

Free shares return the decrypted body immediately (free **invite-only** shares only to a
possession-corroborated whitelisted wallet), matching how free subblog posts are served.
Paid shares require payment: pass a stored `x-nibgate-payment-proof` header, or let the
route relay the x402/Gateway challenge and verify a fresh payment.

For paid shares the challenge amount is the **requester's effective price**, computed
from the wallet passed as `?wallet=0x...` (the unlock UI appends it). Without a wallet the
route mints at the base `price`; if the actual payer's tier differs after verification, the
route returns `409` so the client retries with a correct challenge. Banned wallets are
refused with `403` before and after payment.

**Wallet possession** (ACCESS-CONTROL-DESIGN §3): a `?wallet=` / `walletAddress` value is a
client claim, not an identity. It may influence pricing (whitelist tier, invite-only
eligibility) but never grants content alone. Granting paths — free **invite-only** reads,
**lifetime** re-issue, whitelist **free-tier** grants, and **media** — require one of:

1. a valid, bound `unlockProof` for that wallet, or
2. a SIWE session (`auth_session`) whose wallet matches the claim.

The unlock UI connects + SIWE-signs before unlocking, so the session is normally present.
A wallet with a stored proof keeps working without a session. A paid unlock on an
**invite-only** share also requires the paying wallet to equal the possessed wallet
(`403` otherwise).

```
200
{
  "ok": true,
  "resource": { "id": "<slug>", "title": "...", "type": "article", "price": "1.00", ... },
  "content": { "type": "article", "markdown": "...", "media": [...] },
  "media": null,
  "payment": { "id": "uuid", "amount": "1.00", "currency": "USDC", "txHash": "0x...", "payerWallet": "0x..." },
  "unlockProof": "0x...",       // null on free shares
  "expiresInSeconds": 604800
}
```

## Unlock (x402 pay -> entitlement -> serve)

1. The viewer hits the share page or `GET /nibshare/:slug/access`; without payment
   the route returns a `402` challenge via the Circle Gateway x402 middleware.
2. After USDC settles on Arc (network `eip155:5042002`), the client retries with the
   signed payment (or a stored proof).

Rules (evaluated server-side, wallet known via the x402 pending payer or session):

```
status == "active"
AND (expiresAt IS NULL OR now() < expiresAt)
AND entitlement != "banned"
AND not-invite-only OR (payer in whitelist AND payer == possessed wallet)
```

Invite-only (`publicAccess=false`) shares refuse **any** non-whitelisted wallet with `403`
before a payment challenge is even minted (no pay-before-deny). Free shares return the
body directly — but free **invite-only** reads and the whitelist **free tier**
(`whitelistPrice=0`) still require a possession-corroborated whitelisted wallet.

If the payer has an entitlement with `status == "revoked"`, paying again re-activates it
(soft revoke = re-pay to re-unlock). A `banned` entitlement can never re-pay.

On success the server grants a `NibShareEntitlement` for the paying wallet (`active`)
and serves the body. Only `server` mode is implemented — the server decrypts and
returns the body for this session (no durable key is given to the client):

`POST /nibshare/:slug/unlock`

```
200
{
  "success": true,
  "receipt": { "id": "uuid", "amount": "1.00", "txHash": "0x...", "payerWallet": "0x..." },
  "access": {
    "sessionId": "uuid",
    "expiresAt": "2026-08-05T00:00:00Z", // session TTL tied to this wallet's entitlement
    "body": { "type": "article", "markdown": "..." }  // plaintext, this session only
  }
}
```

Idempotency: x402 has no payment id, so the **nonce is the x402 `txHash`** and the DB
enforces a UNIQUE `(paymentNonce, shareId)` — a replayed proof/txHash hits the **same**
receipt (`{ receipt, replay: true }`) instead of double-granting, double-counting unlocks,
or firing a second view event.

The `unlockProof` on paid/access responses is a claims-MAC in the form
`{wallet}.{iat}.{exp}.{mac}`: `mac = HMAC-SHA256("nibshare:{shareId}:{wallet}:{iat}:{exp}")`
with a backend-only secret (windowing and back-compat details in `utils.js` /
`paymentProofFor`, `walletFromPaymentProof`).

Non-success responses:

- `402 Payment Required` + x402 terms when payment is absent.
- `403 Forbidden` when the wallet is not allowed (invite-only, not whitelisted, banned)
  or its entitlement is `revoked` on a free read / proof replay.
- `409 Conflict` when the minted challenge price no longer matches the payer's tier —
  retry the unlock.
- `410 Gone` when `status == revoked`.
- `419` when `expiresAt` passed — "no new unlocks after expiry".

## Quote (public, per-wallet price)

`GET /nibshare/:slug/quote?wallet=0x...`

The unlock UI and agents call this to show the **effective price for a specific wallet**
and its access state before attempting payment.

```
200
{
  "wallet": "0x...",
  "price": "1.00",                     // public price
  "whitelistPrice": "0.00",            // null = no tier
  "publicAccess": true,
  "whitelisted": true,                 // legacy: empty whitelist = true
  "inWhitelist": true,                 // listed in a non-empty whitelist
  "effectivePrice": "0.00",            // what THIS wallet pays now
  "status": "active" | "revoked" | "banned" | null,
  "revoked": false,
  "banned": false,
  "canUnlock": true,
  "reason": null                       // why not, when canUnlock=false
}
```

## Streaming media

`GET /nibshare/:slug/media/:kind?index=N` (`kind` = `photo` | `music` | `video` | `document`)

Decrypts and streams one asset from the body's `media` array (`index` for photos) or the
body's `audio` / `file` / `document` holders. Free **public** shares serve the bytes with
no proof; free **invite-only** shares and paid shares require an active, possessed
entitlement — via `x-nibgate-payment-proof` (or `?proof=`), or `?wallet=` corroborated by
the SIWE session — otherwise `403`. Responses are `Cache-Control: private, max-age=300`.
Article bodies reference embedded images as `nibgate-embed://N` tokens; the viewer
rewrites them to this route.

## View (public)

`POST /nibshare/:slug/view` — records a viewer for the share's analytics; `{ "viewer": "0x..." }` optional.
Connected wallets are attributed to the view (the share page sends the wallet it has); paid
unlocks also attribute the payer server-side, so owners always see who actually accessed the work.

## Access control (owner only)

`GET /nibshare/:slug/access-control` (cookie auth) — the owner's view of who can and who has
viewed a share. Returns the whitelist + pricing policy, every entitlement (active / revoked /
banned), and the deduped list of connected wallets that have seen the work.

```
200
{
  "whitelist": ["0xabc..."],          // tier members / invite-only list
  "whitelistPrice": "0.00",           // null = no tier
  "publicAccess": true,               // false = invite-only
  "entitlements": [
    { "wallet": "0xabc...", "status": "active",  "grantedAt": "...", "revokedAt": null },
    { "wallet": "0xdef...", "status": "revoked", "grantedAt": "...", "revokedAt": "..." },
    { "wallet": "0x...",   "status": "banned",   "grantedAt": "...", "revokedAt": "..." }
  ],
  "viewers": [
    { "wallet": "0xabc...", "count": 3, "lastSeenAt": "..." }
  ]
}
```

## Update access policy (owner only)

`PUT /nibshare/:slug/access-control` (cookie auth) — sets the whitelist, the whitelist
price tier, and/or the invite-only flag in one call. Any field is optional; unspecified
fields are left unchanged. Body:

```
{ "whitelist": ["0x...", ...], "whitelistPrice": "0.00", "publicAccess": false }
```

- `whitelist` — array of valid `0x` addresses (lowercased). Empty = no tier members.
- `whitelistPrice` — non-negative number; `null` or `""` removes the tier (whitelisted
  wallets pay the public `price`); `"0"` = whitelisted wallets unlock free.
- `publicAccess` — `false` makes the share invite-only: only whitelisted wallets can
  unlock (403 otherwise). Pre-existing whitelist shares were migrated with
  `publicAccess=false` to preserve the old "whitelist = invite-only" behavior.

Flipping a share invite-only — or **editing the whitelist of a share that is already
invite-only** (e.g. removing a wallet) — revokes active entitlements of listed-but-now-cut
paid wallets and marks their latest paid receipt `refundedAt`. The response lists the
wallets cut off:

```
200 { "success": true, "whitelist": ["0x..."], "whitelistPrice": "0.00", "publicAccess": false, "cutOffWallets": ["0x..."] }
```

## Soft-revoke a wallet (owner only)

Owner action: revoke a single wallet's access so it stops being served.

`POST /nibshare/:slug/entitlements/:wallet/revoke` (cookie auth)

**Soft** revoke: the wallet loses current access but may pay again to re-unlock. The most
recent still-unrefunded paid receipt for that wallet is marked `refundedAt` (bookkeeping;
the USDC return happens outside x402) and `revoke`/`refund` events are recorded.

```
200 { "success": true, "wallet": "0x...", "status": "revoked", "refunded": true }
```

## Hard-ban a wallet (owner only)

`POST /nibshare/:slug/entitlements/:wallet/ban` (cookie auth)

**Hard** ban: same as revoke plus the wallet can never pay/unlock again — the entitlement
becomes `banned` and every access/unlock path refuses it with 403. Refunds a paid receipt
if one exists and records `ban`/`refund` events.

```
200 { "success": true, "wallet": "0x...", "status": "banned", "refunded": false }
```

For never-paid wallets a ban still works: a `banned` entitlement is created so even a
future payment attempt is refused.

## Restore a wallet's entitlement

`DELETE /nibshare/:slug/entitlements/:wallet` (cookie auth) — reverses a revoke or ban,
setting the entitlement back to `active`.

```
200 { "success": true, "wallet": "0x...", "status": "active" }
```

## Reslug (owner only)

`POST /nibshare/:slug/reslug` (cookie auth) — rotates the share's public slug.

## Revoke (owner only)

`DELETE /nibshare/:slug` (cookie auth)

```
200 { "success": true, "status": "revoked" }
```

Revoke sets `status = "revoked"`, which stops new unlocks and deletes the R2 blob.

## List mine (owner only)

`GET /nibshare/mine` (cookie auth)

```
200
{ "shares": [ { "id": "...", "slug": "...", "title": "...", "unlockCount": 12, "price": "1.00", ... } ] }
```

## Dashboard stats (owner only)

`GET /nibshare/dashboard?from=&to=` (cookie auth)

Per-creator analytics across all shares (drafts, active, expired, and revoked — a share is
the published content, not the link). `from`/`to` (ISO) bound the range used for
`range` and `timeSeries`; without them the range defaults to the last 30 days. The
`summary` and per-share `views`/`unlocks`/`revenue` are lifetime totals.

```
200
{
  "summary": { "shares": 4, "activeShares": 2, "views": 812, "unlocks": 47, "revenue": 23.5 },
  "range": { "views": 41, "unlocks": 5, "revenue": 2.5 },
  "timeSeries": [ { "date": "2026-08-01", "views": 9, "unlocks": 1, "revenue": 0.5 } ],
  "shares": [ { "slug": "...", "url": "...", "title": "...", "contentType": "text", "price": "1.00",
                "currency": "USDC", "status": "active", "createdAt": "...", "expiresAt": null,
                "views": 812, "unlocks": 47, "revenue": 23.5 } ],
  "recentActivity": [ { "key": "unlock-...", "type": "unlock", "title": "...", "slug": "...",
                        "amount": 0.5, "wallet": "0x...", "createdAt": "..." } ]
}
```

## Platform stats (public)

`GET /nibshare/stats`

Platform-wide aggregates. Everything is aggregate or wallet-truncated on purpose: never
emit nibshare to hub discovery/ledger/reputation, and never expose titles, slugs, or full
wallets in this public feed.

```
200
{
  "totals": { "sharesCreated": 120, "activeShares": 45, "views": 9120, "unlocks": 510, "revenue": 312.4 },
  "windows": {
    "24h": { "views": 310, "unlocks": 12, "revenue": 8.4 },
    "7d":  { "views": 1900, "unlocks": 91, "revenue": 61.2 }
  },
  "recent": [ { "type": "view", "wallet": "0x1a2b...9cD0", "contentType": "text", "createdAt": "..." } ]
}
```

## Errors

All errors: `{ "error": "<message>", "details"?: "<string>" }` with a 4xx/5xx status.

| Code | Meaning |
|---|---|
| 400 | malformed payload / invalid rules |
| 401 | missing/invalid session |
| 403 | invite-only / not whitelisted / banned / entitlement revoked |
| 409 | tier price changed for the payer — retry unlock |
| 410 | share revoked |
| 419 | expired (no new unlocks) |
| 429 | rate limited |
| 500 | storage/payment internal failure |
