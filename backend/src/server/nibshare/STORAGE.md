# Nibshare Storage

Where content bytes live and how they are served, as of Aug 2026. All nibshare
ciphertext is stored on **Nibgate-hosted Cloudflare R2** — there is no Arweave/IPFS/Lit
in the shipped product. `storageProvider` in the schema anticipates a pluggable provider,
but today `service.js` rejects anything other than `'nibgate'`.

## Layout in R2

| Key | Content | Access |
|---|---|---|
| `nibshare/{id}/body.bin` | AES-256-GCM ciphertext of the share body (server-generated content key) | private (read via server decrypt) |
| `nibshare/{userId}/enc/media/{fileId}.bin` | Encrypted media item (image/audio/video/document) | private |
| `nibshare/{userId}/public/preview/{fileId}.webp` | Plaintext WebP preview, images only | public CDN (`R2_PUBLIC_URL`) |

There is **no** plaintext body or media object. `ciphertextUrl` (`https://pub-…r2.dev/nibshare/{id}/body.bin`) is returned to the creator for inspection but the R2 bucket itself is private; serving happens server-side through the decrypt proxy, never straight from the bucket.

## Division of labor

| Layer | What it does | Where it lives |
|---|---|---|
| Money | x402 payment, USDC settlement | **Arc** (eip155:5042002) via Circle Gateway |
| Keys/access | content key K, entitlements, decryptMode | **Nibgate backend** (server-mode only) |
| Integrity | `contentHash` keccak256 commitment | Arc on-chain + DB |
| Bytes | ciphertext | **Cloudflare R2** (`storageProvider: 'nibgate'`) |

`decryptMode` is always `'server'` and `keyProvider` always `'server'`: K never leaves
the backend, and every read is an entitlement-checked, server-side decrypt. In the
DB, `encryptedKey` holds the content key **wrapped with a backend-only KEK**
(`NIBGATE_SHARE_KEY_SECRET`, envelope encryption via `wrapKey`/`unwrapKey` in
`@nibgate/sdk/server`) — never the raw key — so a DB dump alone cannot decrypt R2
ciphertext. The client-mode / Lit paths are planned, not implemented.

## Media strategy

- **Images / small files:** server decrypts and streams; served `private, max-age=300`.
- **Gated media:** the server decrypts the `.bin` per request after checking the proof /
  entitlement. For large files this costs Nibgate bandwidth — a deliberate trade of
  the hosted `server` mode (see the README threat model).
- **Video:** stored as a single encrypted blob today; per-segment key streaming is a
  future optimization, not required for the current size caps.

## Upload path

1. Client uploads raw media to `POST /api/uploads/content?encrypted=1` (cookie auth).
   Images are optimized to WebP (sharp: rotate, ≤2560px, q90) before encryption.
2. Server encrypts with AES-256-GCM, stores the `.bin` under `nibshare/{userId}/enc/media/`,
   and writes a public WebP preview at `nibshare/{userId}/public/preview/` (images only).
3. Create/share stores `{ storageRef, encryptedKey, contentType, name, size }` in the
   body's `media` array and encrypts the article body itself to `nibshare/{id}/body.bin`.

## Config

```
R2_ENDPOINT           # required
R2_ACCESS_KEY_ID      # required
R2_SECRET_ACCESS_KEY  # required
R2_BUCKET             # required
R2_PUBLIC_URL         # required (public CDN base for previews + ciphertextUrl)
```

## Size limits

| Content | Cap | Enforcement |
|---|---|---|
| Nibshare body (text/article) | 512 KB | `POST /nibshare` |
| Nibshare media per item | 30 MB | `POST /api/uploads/content` |

The future Arweave/Lit tier plan (permanent storage, creator-paid fees, decentralized
keys) is tracked separately in `STORAGE-TIER-PLAN.md`; none of it is live yet.
