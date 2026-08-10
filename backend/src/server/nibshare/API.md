# Nibshare API

Base URL: `https://api.nibgate.xyz` (backend); share pages at `https://nibgate.xyz/ns/<slug>`.

Short-link suffix `slug` is an 8-char base58 string as the share's stable id on the
public page. The DB keeps `slug @unique` and `id` (uuid) as the internal key.

## Auth

Requests that create or manage shares use a Nibgate **session cookie** (`auth_session`)
issued by the nonce-based PersonalSignature wallet login
(`packages/cli/src/core/auth.js`). Owner-only routes check that the session wallet owns
the share. There is no SIWE bearer-token mode.

## Creating a share

`POST /api/nibshare` (cookie auth)

```
{
  "title": "My notes on x402",
  "summary": "gated notes",
  "content": { "type": "article", "markdown": "# hi", "media": [ { "storageRef": "nibshare/...bin", "encryptedKey": "<base64>", "contentType": "image/webp", "name": "pic.png", "size": 1234 } ] },
  "coverUrl": "https://pub-...r2.dev/nibshare/.../preview.webp", // optional public preview
  "price": "1.00",                     // USDC; "0" = free
  "expiresAt": "2026-08-05T00:00:00Z", // optional, null = never (capped at 7 days)
  "whitelist": [ "0xabc...", "0xdef..." ], // optional; empty = anyone who pays
  "storageProvider": "nibgate",        // only "nibgate" is supported today
  "contentType": "text"                // legacy: "text" for plain bodies
}
```

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

`GET /api/nibshare/:slug/meta`

```
200
{
  "title": "My notes on x402",
  "summary": "gated notes",
  "coverUrl": "...",
  "price": "1.00",
  "currency": "USDC",
  "contentType": "text",
  "expiresAt": null,            // null = never expires (capped at 7 days)
  "createdAt": "...",
  "whitelist": true,            // boolean: is access wallet-restricted
  "status": "active",
  "viewCount": 0,               // lifetime views
  "unlockCount": 0,             // lifetime unlocks
  "revenue": 0                  // unlockCount * price (USDC)
}
```

## Manifest (machine-readable contract)

`GET /api/nibshare/:slug/manifest`

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
  "currency": "USDC",
  "expiresAt": null,
  "status": "active",
  "createdAt": "...",
  "viewCount": 0,
  "unlockCount": 0,
  "urls": {
    "page": "https://nibgate.xyz/ns/<slug>",
    "meta": "https://api.nibgate.xyz/api/nibshare/<slug>/meta",
    "manifest": "https://api.nibgate.xyz/api/nibshare/<slug>/manifest",
    "access": "https://api.nibgate.xyz/api/nibshare/<slug>/access",
    "unlock": "https://api.nibgate.xyz/api/nibshare/<slug>/unlock",
    "media": "https://api.nibgate.xyz/api/nibshare/<slug>/media/{kind}?index=N"
  },
  "payment": { "scheme": "x402", "description": "..." }
}
```

## Access (server-side body)

`GET /api/nibshare/:slug/access`

Free shares return the decrypted body immediately, matching how free subblog posts are
served. Paid shares require payment: pass a stored `x-nibgate-payment-proof` header, or
let the route relay the x402/Gateway challenge and verify a fresh payment.

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

1. The viewer hits the share page or `GET /api/nibshare/:slug/access`; without payment
   the route returns a `402` challenge via the Circle Gateway x402 middleware.
2. After USDC settles on Arc (network `eip155:5042002`), the client retries with the
   signed payment (or a stored proof).

Rules (evaluated server-side, wallet known via the x402 pending payer):

```
status == "active"
AND (expiresAt IS NULL OR now() < expiresAt)
AND (whitelist empty OR payerWallet in whitelist)
```

On success the server grants a `NibShareEntitlement` for the paying wallet (`active`)
and serves the body. Only `server` mode is implemented — the server decrypts and
returns the body for this session (no durable key is given to the client):

`POST /api/nibshare/:slug/unlock`

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

Non-success responses:

- `402 Payment Required` + x402 terms when payment is absent.
- `403 Forbidden` when whitelist excludes the payer, or the wallet's entitlement is
  `revoked` (the hard-revoke path).
- `410 Gone` when `status == revoked`.
- `419` when `expiresAt` passed — "no new unlocks after expiry".

## Streaming media

`GET /api/nibshare/:slug/media/:kind?index=N` (`kind` = `photo` | `music` | `video` | `document`)

Decrypts and streams one asset from the body's `media` array (`index` for photos) or the
body's `audio` / `file` / `document` holders. Free shares serve the bytes with no proof;
paid shares require an active entitlement via `x-nibgate-payment-proof` (or `?proof=`),
otherwise `403`. Responses are `Cache-Control: private, max-age=300`. Article bodies
reference embedded images as `nibgate-embed://N` tokens; the viewer rewrites them to this
route.

## View (public)

`POST /api/nibshare/:slug/view` — records a viewer for the share's analytics; `{ "viewer": "0x..." }` optional.

## Revoke a wallet's entitlement

Owner action: revoke a single wallet's access so it stops being served.

`POST /api/nibshare/:slug/entitlements/:wallet/revoke` (cookie auth)

```
200 { "success": true, "wallet": "0x...", "status": "revoked" }
```

In `server` mode this is a **hard** stop: the wallet has no valid entitlement, so the
content no longer shows.

## Reslug (owner only)

`POST /api/nibshare/:slug/reslug` (cookie auth) — rotates the share's public slug.

## Revoke (owner only)

`DELETE /api/nibshare/:slug` (cookie auth)

```
200 { "success": true, "status": "revoked" }
```

Revoke sets `status = "revoked"`, which stops new unlocks and deletes the R2 blob.

## List mine (owner only)

`GET /api/nibshare/mine` (cookie auth)

```
200
{ "shares": [ { "id": "...", "slug": "...", "title": "...", "unlockCount": 12, "price": "1.00", ... } ] }
```

## Dashboard stats (owner only)

`GET /api/nibshare/dashboard?from=&to=` (cookie auth)

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

`GET /api/nibshare/stats`

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
| 403 | payer not whitelisted, or media/entitlement revoked |
| 410 | share revoked |
| 419 | expired (no new unlocks) |
| 429 | rate limited |
| 500 | storage/payment internal failure |
