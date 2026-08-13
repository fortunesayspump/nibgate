# nibshare

Hosted quick-share for gated content — no domain required.

Nibshare lets anyone connect a wallet, write content, set a USDC price, an optional
expiry, and an optional wallet whitelist, then get a short link
(`https://nibgate.xyz/ns/<slug>`) to share. Unlocking uses the same
x402 / USDC / Circle Gateway rail as the rest of Nibgate.

It is the **on-ramp / demo tier** of Nibgate. The flagship thesis stays: creators keep
content on their own domains, and Nibgate verifies + indexes. Nibshare is for the
moment you just want to gate a snippet fast without standing up a site.

---

## Why it exists

Trying Nibgate today costs: own a domain -> add the widget -> pass site verification.
Nibshare drops that to a wallet signature and a link. Same payment rail, same receipts,
fraction of the friction.

## What is implemented today

Current build (`backend/src/server/nibshare/routes.js`, `controller.js`, `service.js`):

- **Storage:** Nibgate-hosted R2 blobs only. The schema keeps a `storageProvider`
  field, but the create route rejects anything but `nibgate`:
  `only the nibgate storage provider is supported yet`. Plaintext bodies are capped at
  **512 KiB** on the free tier (`FREE_TIER_MAX_BYTES`); anything larger is rejected.
- **Encryption:** the content key is generated **server-side** (`generateContentKey`),
  the body is encrypted with AES-256-GCM (`encryptBytes`), and the ciphertext is
  uploaded as a blob at `nibshare/{id}/body.bin` (`putBlob`). `keyProvider: 'server'`,
  `decryptMode: 'server'` — the key lives in the backend row (`encryptedKey`, base64)
  and the body is decrypted server-side on unlock. No key or ciphertext is ever vended
  to the browser.
- **Integrity:** `contentHash = keccak256("nibshare:v1|{ownerWallet}|{storageRef}|{plaintext}")`
  (`contentHashFor` in `packages/nibgate/src/server/crypto.js`) is stored on the share.
- **Auth:** wallet login via a nonce-based SIWE (EIP-4361) signature
  (`packages/internal/src/auth.js`), establishing an `auth_session` cookie. Owner-only
  routes (delete / revoke / mine) check that the session wallet owns the share.
- **Viewer flow:** a public viewer page lives at `https://nibgate.xyz/ns/<slug>`
  (`frontend/src/app/ns/[slug]/page.tsx`). Free shares render directly; paid shares
  unlock through the same x402 / Gateway rail, then stream any embedded media through
  the encrypted-media proxy.
- **Embedded media:** the editor uploads images/audio/video/documents to
  `POST /api/uploads/content?encrypted=1` (`backend/src/server/routes/upload-routes.js`).
  Files are optimized (images → WebP) and AES-256-GCM encrypted to
  `nibshare/{userId}/enc/media/…bin`; images also get a public `previewUrl` WebP for
  the share card. The article body is stored as
  `{ type: 'article', markdown, media: [{ storageRef, encryptedKey, contentType, name, size }] }`,
  with `nibgate-embed://N` tokens inline in the markdown. Tokens resolve to
  `GET /nibshare/:slug/media/photo?index=N`, which decrypts and streams the asset
  (paid and free-invite-only shares gate on an active possessed entitlement; free
  public shares are open).

The schema also carries `decryptMode`, `keyProvider`, `lit`/`arweave`/`ipfs` strings,
and a `whitelist`/`expiresAt` — forward-compatible fields for the tiers below, but
only the `server` / `nibgate` path is implemented.

## The one hard design decision: storage vs. revocation

The whole point of this doc is the tradeoff we settled after researching the space
(Arc has **no** native storage — it is a payments L1; bytes would live on
IPFS/Arweave/etc.).

**You cannot have permanent decentralized storage AND hard revocation of everyone.**
The read act *is* possession: anything a viewer decrypts once in their own environment
is theirs forever. No key-wrap/rewrap scheme removes that. So the revocation guarantee
is decided by one switch on each share:

| `decryptMode` | Body delivery | Revocation | Decentralization |
|---|---|---|---|
| `client` | ciphertext + key vended once; buyer decrypts in-browser | **SOFT** — revoking stops future sessions, can't un-read a decrypted copy | fully decentralized (bytes on Arweave/IPFS) |
| `server` | server decrypts and serves the body per session | **HARD** — wallet's entitlement is revoked, content stops showing | centralized serving for that share |

Today only `server` mode is implemented: the backend decrypts and returns the body
inside the unlock response (with a 1-hour `sessionId`/`expiresAt`), and a wallet's
access is revoked by flipping its `NibShareEntitlement` to `revoked` — or the whole
share to `status: revoked`. Because the viewer never durably holds the key or
plaintext, a revoked wallet is refused going forward. This is the hard-revocation
mode; `client` mode is the design target for fully decentralized storage, not yet
shipped.

### Expiry

`expiresAt` stops NEW unlocks and (in `server` mode) new sessions. It never revokes
entitlements already granted. Hard "everyone loses access at midnight" requires
`server` mode + revoking entitlements — there is no way to do it on permanent
decentralized storage.

## Core flow

```
Creator: connect wallet -> write -> set price/expiry/whitelist
   -> media uploaded encrypted via /api/uploads/content?encrypted=1
   -> server encrypts body (AES-GCM, server-generated key)
   -> ciphertext to R2 (nibshare/{id}/body.bin), metadata row created
   -> short link  nibgate.xyz/ns/<slug>
Viewer (human or agent): open /ns/<slug> (or POST /nibshare/:slug/meta -> 402 terms)
   -> pays USDC via x402 (Circle Gateway, eip155:5042002)
   -> POST /nibshare/:slug/unlock (or GET /nibshare/:slug/access with proof)
   -> rules checked (active, not expired, whitelisted, paid)
   -> server decrypts and returns body; embedded media streams via
      GET /nibshare/:slug/media/photo?index=N
```

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/uploads/content?encrypted=1` | wallet-signature session | Upload + encrypt media for a share body (images → WebP first) |
| POST | `/nibshare` | wallet-signature session | Create a share (server encrypts body, stores ciphertext in R2) |
| GET | `/nibshare/:slug/meta` | none | Public metadata (title, summary, price, expiry, whitelist flag, view/unlock counts) — never body |
| GET | `/nibshare/:slug/access` | none (proof/session for paid + free-invite) | Server-side body: free public open, paid x402/relay, free invite-only requires possessed whitelisted wallet |
| POST | `/nibshare/:slug/unlock` | x402 payment (or session/proof for free tiers) | Rules check -> server returns plaintext body |
| POST | `/nibshare/:slug/view` | none | Record a viewer |
| GET | `/nibshare/:slug/media/:kind?index=N` | proof/session for non-public | Stream one decrypted asset (`photo`/`music`/`video`/`document`) |
| POST | `/nibshare/:slug/entitlements/:wallet/revoke` | owner | Revoke one wallet's entitlement (hard revoke in `server` mode) |
| DELETE | `/nibshare/:slug` | owner | Revoke the share (sets `status=revoked`) and deletes the R2 blob |
| POST | `/nibshare/:slug/reslug` | owner | Rotate the share's slug |
| POST | `/nibshare/gateway/balance` | none | Look up a Gateway balance |
| GET | `/nibshare/mine` | owner | Creator's shares + receipts |
| GET | `/nibshare/dashboard` | owner | Creator analytics: lifetime summary, range + daily time series, per-share breakdown, recent activity |
| GET | `/nibshare/stats` | none | Public platform aggregates (totals, 24h/7d windows, truncated-wallet activity feed) |

Rules check at unlock time: `status == active AND not past expiresAt AND not banned AND
(not invite-only OR payer in whitelist)`. A bare `?wallet=` is a *claim*, not an identity —
granting paths (free invite-only reads, lifetime re-issue, free-tier grants, media)
require possession: a valid bound `unlockProof` or a SIWE session matching the claim.
Invite-only paid shares `403` a non-whitelisted wallet before any payment challenge.

Unlock response:

```json
{
  "success": true,
  "receipt": { "id": "...", "amount": "1", "txHash": "0x...", "payerWallet": "0x..." },
  "access": { "sessionId": "...", "expiresAt": "...", "body": "..." }
}
```

## Reusing existing Nibgate pieces

- **Payments:** the `POST /hub/pay` Circle Gateway x402 middleware pattern
  (`backend/src/server/routes/hub-routes.js`). Nibshare relays the same
  `createGatewayMiddleware` check with `sellerAddress = ownerWallet`,
  `price = NibShare.price`, network `eip155:5042002`
  (`backend/src/server/nibshare/controller.js` `relayX402Payment`).
- **Receipts:** `NibShareReceipt` mirrors `UnlockReceipt` (payer, txHash, amount).
- **Keccak commitment:** `contentHashFor` from `@nibgate/sdk/server`
  (`packages/nibgate/src/server/crypto.js`).
- **Auth:** nonce-based SIWE (EIP-4361) session login (`packages/internal/src/auth.js`).

## Phasing (Tier 1 shipped, Tiers 2–3 designed)

- **Tier 1 (shipped):** `nibgate`-hosted storage, server-generated keys, wallet-signature
  login, x402 unlock, short link. The schema already carries `keyProvider`,
  `storageProvider`, `storageRef`, `encryptedKey`, `decryptMode` so upgrades are
  non-breaking.
- **Tier 2 (decentralized keys):** Lit Protocol PKP + Lit Action enforcing
  payment/whitelist/expiry before decryption. Removes Nibgate as key-holder. Costs a
  second network + credits. Even Lit cannot revoke issued keys — only refuse new
  decryptions after expiry. (Designed, not implemented.)
- **Tier 3 (decentralized metadata + storage):** `arweave`/`ipfs` adapters and
  `client` `decryptMode`; publish ciphertext + title/summary/price to the same
  storage; the hub catalog becomes an index of CIDs, not the source of truth.
  (Designed, not implemented.)

## Threat model / what this does NOT do

- **`client` mode cannot take a copy back.** A viewer who decrypted once keeps a
  private copy even after entitlement revocation. Their entitlement is refused going
  forward, but the copy persists. Choose `server` mode for hard revocation.
- **`server` mode handles all reads through Nibgate.** It revokes cleanly but is
  centralized; it does not preserve the decentralized-storage property for that share.
- **Does not prevent copy/paste during any legitimate read.** Even `server` mode shows
  the viewer plaintext in-session; a determined user can save it during the session.
- **Does not hide existence.** Ciphertext + metadata are stored and served by Nibgate;
  confidentiality is the plaintext, via the key.
- **Trust assumptions:** `server` mode trusts Nibgate to enforce entitlements and hold
  the content key. `client` mode (future) trusts storage providers to serve bytes
  honestly; integrity is enforced by `contentHash` regardless.

## Config

```
NIBGATE_SHARE_BASE_URL   # base for short links (default https://nibgate.xyz/ns)
NIBGATE_PAYMENT_NETWORK  # eip155:5042002 (Arc Testnet) by default
NIBGATE_FACILITATOR_URL  # Circle Gateway facilitator override
```

## Related

- Payments rail: `backend/src/server/routes/hub-routes.js` (`/hub/pay`)
- Integrity commitment: `packages/nibgate/src/server/crypto.js` (`contentHashFor`)
- Schema: `packages/cli/prisma/schema.prisma` (`NibShare`, `NibShareReceipt`, `NibShareEntitlement`)
