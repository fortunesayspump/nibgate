# Nibgate Storage Tier Plan

General-purpose encrypted blob storage. Two providers: free (R2) and paid (Arweave).
Storage layer is infrastructure. Nibshare, subblog uploads, hub uploads all consume it.

---

## 1. Architecture

### SDK (`@nibgate/sdk/server`) — Blueprint

The SDK provides the contract. It does NOT bundle provider implementations.

| Export | Purpose |
|---|---|
| `registerProvider(name, factory, config)` | Register a storage provider at app startup |
| `putBlob({ provider, key, data, contentType })` | Upload encrypted blob |
| `getBlob({ provider, storageRef })` | Download blob |
| `deleteBlob({ provider, storageRef })` | Delete blob |
| `generateContentKey()` | Random 256-bit AES-GCM key |
| `encryptBytes(key, plaintext)` | AES-256-GCM encrypt |
| `decryptBytes(key, iv, tag, ciphertext)` | AES-256-GCM decrypt |
| `packCipherBlob(enc)` / `unpackCipherBlob(blob)` | Serialize/deserialize ciphertext |
| `contentHashFor(wallet, storageRef, plaintext)` | keccak256 commitment |

### Backend — Implementation

The backend registers providers at startup and owns all provider-specific code.

| File | Purpose |
|---|---|
| `server.js` | Calls `registerProvider('nibgate', createNibgateProvider, config)` inside `createApp()` |
| `lib/nibgate-provider.js` | R2 S3Client implementation (owns `@aws-sdk/client-s3`) |
| `routes/nibshare-routes.js` | Imports crypto + storage directly from `@nibgate/sdk/server` |
| `routes/upload-routes.js` | Imports `putBlob`/`deleteBlob` from `@nibgate/sdk/server` |

Consumers (subblogs) register their own provider against the same SDK contract:

| File | Purpose |
|---|---|
| `subblogs/backend/src/lib/r2-provider.js` | R2 S3Client implementation (CJS) |
| `subblogs/backend/src/lib/storage.js` | `registerProvider('nibgate', createR2Provider, config)` |

### Why this split

- SDK is for general use. Any consumer (subblogs, third-party apps) can `registerProvider` with their own backend.
- `@aws-sdk/client-s3` stays in the backend. The SDK has zero heavy dependencies.
- Provider registration is a one-liner at app startup. Config lives where it's used.

### Provider interface

```js
registerProvider(name, config => ({
  put: async ({ key, data, contentType, cacheControl? }) => ({ storageRef, url }),
  get: async ({ storageRef }) => Buffer,
  delete: async ({ storageRef }) => void,
}), config)
```

---

## 2. Server-mode-only

Content key K never leaves the server.

### Why

- Client mode gives K to buyer. Once they have it, revocation is soft.
- Server mode: server holds K, decrypts per-session, checks entitlement each time.
- Nibshare is a hosted service. Centralization is the deal.
- Content is small. Server-side decryption is trivial.

### Flow

```
Create:
  1. Generate random content key K (per-content, 256-bit)
  2. Encrypt plaintext with K -> ciphertext
  3. Store ciphertext on blob store (R2 or Arweave)
  4. Store K in DB (encrypted at rest by DB)
  5. Compute contentHash = keccak256("nibshare:v1|wallet|storageRef|plaintext")
  6. Store metadata in DB

Unlock:
  1. Buyer pays USDC via x402
  2. Server checks: active, not expired, wallet in whitelist
  3. Server creates receipt + entitlement
  4. Server fetches ciphertext from blob store
  5. Server decrypts with K -> plaintext
  6. Returns plaintext to buyer (K never sent)

Revoke:
  1. Owner revokes entitlement
  2. Next unlock attempt fails -> server refuses
  3. Hard revoke. No K leaked.
```

---

## 3. Two upload paths

### Nibgate free tier (storageProvider: "nibgate")

- Cost: $0
- Size-limited per content type
- Cloudflare R2, centralized

### Arweave tier (storageProvider: "arweave")

- Creator pays network fee (~$0.001-0.01/KB via Irys)
- No size limit
- Arweave, permanent, decentralized

### Same across both

| Layer | Detail |
|---|---|
| Encryption | AES-256-GCM |
| Content hash | keccak256 commitment |
| Unlock flow | x402 pay -> entitlement check -> server decrypts -> plaintext |
| Revocation | Entitlement revoked -> server refuses -> done |
| Metadata | Title, summary, price, expiry -- DB only |

---

## 4. Size limits

| Content type | Free tier cap | Arweave cap | Enforcement |
|---|---|---|---|
| Nibshare text | 512 KB | none | POST /api/nibshare |
| Nibshare media | 10 MB | none | POST /api/nibshare |
| Hub avatar | 2 MB | N/A | POST /api/uploads/profile-image |
| Hub cover | 5 MB | N/A | POST /api/uploads/profile-image |
| Subblog media | 10 MB | none | multer fileSize |

---

## 5. Migration plan

### Phase 1: Shared storage layer (done)

1. Create `packages/nibgate/src/server/crypto.js` — crypto primitives
2. Create `packages/nibgate/src/server/storage.js` — `registerProvider` + `putBlob`/`getBlob`/`deleteBlob`
3. Export from `packages/nibgate/src/server/index.js`
4. Create `backend/src/server/lib/nibgate-provider.js` — R2 impl
5. Register provider in `backend/src/server/server.js`
6. Update `nibshare-routes.js` — import crypto + storage from SDK, server-mode-only unlock, 512KB size cap
7. Update `upload-routes.js` — import `putBlob`/`deleteBlob` from SDK
8. Backend `package.json` — `@nibgate/sdk` published to npm as `^0.3.0` (no `workspace:*`)

### Phase 1b: Subblog media uploads (done)

1. Create `subblogs/backend/src/lib/r2-provider.js` + `lib/storage.js` (CJS, own R2 config)
2. `upload.route.js` uses `putBlob` from `@nibgate/sdk/server` instead of raw S3Client/PutObjectCommand
3. Subblog backend is outside the pnpm workspace — installs via its own npm `package-lock.json`
4. Public assets (cover art, images, audio) stay on the plaintext free tier — only gated content is encrypted

### Phase 2: Arweave provider (later)

1. Build Arweave provider (register in server.js)
2. Fee estimation endpoint
3. Wire creator wallet signing
4. Accept `storageProvider: "arweave"` in UI + routes

### Phase 3: Subblog gated content encryption (in progress)

1. `BlogPost` gains `contentKey`, `bodyStorageRef`, `audioStorageRef`, `audioEncryptedKey`, `audioContentType` (nullable)
2. Done — paid subblog content is encrypted at rest with the SDK K-model:
   - Body: `generateContentKey` → `encryptBytes` → `packCipherBlob` → `putBlob` on create/update (`blog.service.js`); plaintext never written to `bodyMarkdown` for paid posts
   - Audio/photos: `upload.route.js` supports `?encrypted=1`, returning `{ storageRef, encryptedKey, contentType }` instead of a public URL
   - Cover art and free-post assets stay on the plaintext free tier
   - `GET /nibgate/access` decrypts the body server-side after `verifyUnlockToken`
   - `GET /nibgate/media/:postId/:kind` streams decrypted audio/photos after the same unlock proof (402 challenge otherwise)
   - Admin `getById` decrypts the body so the author can re-edit; `getBySlug` strips `contentKey`/`bodyStorageRef`/`audioStorageRef` from paid teasers
3. Subblog UI: "Nibgate hosted" or "Arweave" selector (later)
4. Public assets stay on free tier (already done in Phase 1b)

---

## 6. Env vars

| Variable | Required | Provider |
|---|---|---|
| R2_ENDPOINT | yes | nibgate |
| R2_ACCESS_KEY_ID | yes | nibgate |
| R2_SECRET_ACCESS_KEY | yes | nibgate |
| R2_BUCKET | yes | nibgate |
| R2_PUBLIC_URL | yes | nibgate |
| ARWEAVE_BUNDLER_URL | no | arweave |
| ARWEAVE_KEY_FILE | no | arweave |

---

## 7. Prisma models

```
NibShare            - quick-share gated content
NibShareEntitlement - per-wallet access (active/revoked)
NibShareReceipt     - payment receipts
```

K stored as `encryptedKey` (base64) in the `NibShare` row. DB encryption handles key-at-rest.
No `NIB_SHARE_KEY_SECRET` env var.
