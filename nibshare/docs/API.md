# Nibshare API

Base URL: `https://api.nibgate.xyz` (backend); share pages at `https://nibgate.xyz/s/<slug>`.

Short-link suffix `slug` is an 8-char base58 string as the share's stable id on the
public page. The DB keeps `slug @unique` and `id` (uuid) as the internal key.

## Creating a share

SIWE-signed request. Body can be the plaintext (client already encrypted and uploaded)
or the raw content (server encrypts and uploads) — pick one mode; the client-side
encrypt mode is recommended and matches the "plaintext never on the wire/storage" goal.

`POST /api/nibshare`

```
Authorization: bearer <siwe-token>
{
  "title": "My notes on x402",
  "summary": "gated notes",
  "content": { "text": "..." },      // only if server-side encrypt + upload
  "price": "1.00",                   // USDC; "0" = paid-free
  "expiresAt": "2026-08-05T00:00:00Z", // optional, null = never
  "whitelist": [ "0xabc...", "0xdef..." ], // optional; empty = anyone who pays
  "storageProvider": "arweave"       // local | arweave | ipfs
}
```

**Client-side encrypt mode** (recommended):

1. Client generates key `K`, encrypts plaintext -> `ciphertext`.
2. Client uploads `ciphertext` + metadata to the storage adapter (via the same POST,
   provider-aware), gets `{ storageRef, ciphertextUrl, metadataUrl }`.
3. Client POSTs the record with `contentHash` set (or server computes it from a hash of
   the ciphertext + ownerWallet + storageRef).

Requests to return:

```
201 Created
{
  "id": "uuid",
  "slug": "9aB3cD4e",
  "url": "https://nibgate.xyz/s/9aB3cD4e",
  "title": "My notes on x402",
  "price": "1.00",
  "expiresAt": "2026-08-05T00:00:00Z",
  "storageProvider": "arweave",
  "storageRef": "ar://...",
  "metadataUrl": "https://arweave.net/...",
  "contentHash": "0x..."
}
```

Token is a Nibgate session issued from the existing SIWE login flow
(`/api/hub/auth`, `Session`).

## Meta (public)

Anyone can fetch metadata — never the body.

`GET /api/nibshare/:slug/meta`

```
200
{
  "title": "My notes on x402",
  "summary": "gated notes",
  "price": "1.00",
  "currency": "USDC",
  "expiresAt": "2026-08-05T00:00:00Z", // null = never expires
  "whitelist": true,                    // boolean: is access wallet-restricted
  "status": "active"
}
```

## Unlock (x402 pay -> entitlement -> serve)

1. Client/agent `GET`s the share page; the page (or the agent, hitting
   `/api/nibshare/:slug/meta` + `POST /api/nibshare/:slug/unlock`) gets a 402 challenge
   via the Circle Gateway x402 middleware when payment is absent.
2. After USDC settles on Arc (network `eip155:5042002`), the client retries
   `POST /api/nibshare/:slug/unlock` with the signed payment.

Rules (evaluated server-side, wallet-known via the x402 pending payer):

```
status == "active"
AND (expiresAt IS NULL OR now() < expiresAt)
AND (whitelist empty OR payerWallet in whitelist)
```

On success the server grants a `NibShareEntitlement` for the paying wallet (`active`)
and serves the body according to `decryptMode`:

- `client` mode — return the ciphertext + vended key (buyer decrypts in-browser):

```
200
{
  "success": true,
  "decryptMode": "client",
  "receipt": { "id": "uuid", "amount": "1.00", "txHash": "0x...", "payerWallet": "0x..." },
  "access": {
    "ciphertextUrl": "https://arweave.net/...",
    "keyProvider": "server",
    "encryptedKey": "<base64 AES-GCM wrapped K>",
    "contentHash": "0x..."
  }
}
```

- `server` mode — server decrypts and returns the body for this session (no durable
  key is given to the client):

```
200
{
  "success": true,
  "decryptMode": "server",
  "receipt": { "id": "uuid", "amount": "1.00", "txHash": "0x...", "payerWallet": "0x..." },
  "access": {
    "sessionId": "uuid",
    "expiresAt": "2026-08-05T00:00:00Z",  // session TTL tied to this wallet's entitlement
    "body": { "text": "..." }             // plaintext, this session only
  }
}
```

Non-success responses:

- `402 Payment Required` + x402 terms when payment is absent.
- `403 Forbidden` when whitelist excludes the payer, or the wallet's entitlement is
  `revoked` (in `server` mode this is the hard-revoke path).
- `410 Gone` when `status == revoked`.
- `419/410` (or `400`) when `expiresAt` passed — "no new unlocks after expiry".

## Revoke a wallet's entitlement

Owner action: revoke a single wallet's nibkey so it stops being served.

`POST /api/nibshare/:slug/entitlements/:wallet/revoke`

```
Authorization: bearer <siwe-token>
200 { "success": true, "wallet": "0x...", "status": "revoked" }
```

In `server` mode this is a **hard** stop: the wallet has no valid entitlement (nibkey),
so the content no longer shows. In `client` mode it blocks future unlocks/sessions but
cannot take back a copy the wallet already decrypted.

## Revoke (owner only)

`DELETE /api/nibshare/:slug`

```
Authorization: bearer <siwe-token>
200 { "success": true, "status": "revoked" }
```

Revoke sets `status = "revoked"`, which stops new unlocks. It does **not** delete the
permanent ciphertext or invalidate already-issued keys (see README threat model).

## List mine (owner only)

`GET /api/nibshare/mine`

```
Authorization: bearer <siwe-token>
200
{ "shares": [ { "id": "...", "slug": "...", "title": "...", "unlockCount": 12, "price": "1.00", ... } ] }
```

## Storage adapter interface

Adapters implement `put` and `get`:

```
put({ provider, bytes, { name, contentType } }) -> { storageRef, url }
get(storageRef) -> bytes (Buffer)
```

- `local`: blob in DB/S3, `storageRef = local:<uuid>`.
- `arweave`: upload via arweave-js/Irys; return `ar://<txid>` and a gateway URL.
- `ipfs`: add to IPFS + pin; return `ipfs://<cid>` and a gateway URL.

All adapters store **ciphertext only**. Metadata objects are also stored alongside
(Tier 3 goal) but remain publicly non-sensitive (never the plaintext body).

## Errors

All errors: `{ "error": "<message>", "details"?: "<string>" }` with a 4xx/5xx status.

| Code | Meaning |
|---|---|
| 400 | malformed payload / invalid rules |
| 401 | missing/invalid SIWE session |
| 403 | payer not whitelisted |
| 410 | share revoked |
| 419 | expired (no new unlocks) |
| 429 | rate limited |
| 500 | storage/payment internal failure |