# nibshare

Hosted quick-share for gated content — no domain required.

Nibshare lets anyone **connect a wallet, write content, set a USDC price, an optional
expiry, and an optional wallet whitelist, then get a short link** to share. Unlocking
uses the same x402 / USDC / Circle Gateway rail as the rest of Nibgate.

It is the **on-ramp / demo tier** of Nibgate. The flagship thesis stays: creators keep
content on their own domains, and Nibgate verifies + indexes. Nibshare is for the
moment you just want to gate a snippet fast without standing up a site.

---

## Why it exists

Trying Nibgate today costs: own a domain -> add the widget -> pass site verification.
Nibshare drops that to a wallet signature and a link. Same payment rail, same receipts,
fraction of the friction.

## The one hard design decision: storage vs. revocation

The whole point of this doc is the tradeoff we settled after researching the space
(Arc has **no** native storage — it is a payments L1; bytes live on IPFS/Arweave/etc.).

**You cannot have permanent decentralized storage AND hard revocation of everyone.**
The read act *is* possession: anything a viewer decrypts once in their own environment
is theirs forever. No key-wrap/rewrap scheme removes that. So revocation guarantee is
decided by one switch on each share:

| `decryptMode` | Body delivery | Revocation | Decentralization |
|---|---|---|---|
| `client` | ciphertext + key vended once; buyer decrypts in-browser | **SOFT** — revoking stops future sessions, can't un-read a decrypted copy | fully decentralized (bytes on Arweave/IPFS) |
| `server` | server decrypts and serves the body per session | **HARD** — wallet's entitlement is revoked, content stops showing | centralized serving for that share |

### The wallet-linked entitlement (how `server` revocation actually works)

Nibshare keys the gate to a wallet, not to a disposable token. Each unlock creates a
`NibShareEntitlement` (shareId + wallet + status). In `server` mode the viewer connects
their wallet, Nibgate confirms a valid `active` entitlement, and the server decrypts
and serves the body for that session — the viewer never durably holds the key or
plaintext. **Revoke the entitlement (or the share) and the wallet no longer has a valid
nibkey, so the content stops showing.** Tying the key to the wallet is what makes
revocation real: a revoked wallet is refused, even mid-session.

> In `client` mode the entitlement still gates *unlocks*, but because the buyer has
> already received the ciphertext+key, revoking only stops *future* sessions. Treat it
> as "stop the bleed," not "take it back."

### Expiry

`expiresAt` stops NEW unlocks/key issuance and (in `server` mode) new sessions. It
never revokes entitlements already granted. Hard "everyone loses access at midnight"
requires `server` mode + revoking entitlements — there is no way to do it on permanent
decentralized storage.

## Architecture

Three layers, mirroring the wider Nibgate design:

```
┌──────────────────────────────────────────────────────────────┐
│ 1. STORAGE (bytes)   ciphertext + public metadata only      │
│    provider: local | arweave | ipfs   (adapter interface)   │
│    NEVER the plaintext                                        │
├──────────────────────────────────────────────────────────────┤
│ 2. INTEGRITY (proof)  contentHash = keccak256(...)           │
│    registered in DB (and on-chain later)                      │
│    fetchers verify the bytes hash-match the commitment        │
├──────────────────────────────────────────────────────────────┤
│ 3. ACCESS CONTROL (keys)  x402 pay -> wallet entitlement     │
│    decryptMode 'client': vend ciphertext+key (decentralized, │
│                          soft revoke)                        │
│    decryptMode 'server': server-serve per session, keyed to  │
│                          wallet-linked nibkey (hard revoke)  │
│    Tier 1: 'server' key provider (ship now)                  │
│    Tier 2: 'lit' Lit PKP + Lit Action (decentralized keys)   │
│    Tier 3: metadata off Nibgate too (catalog = CID index)    │
└──────────────────────────────────────────────────────────────┘
```

### Storage adapters (layer 1)

| provider | model | cost | use when |
|---|---|---|---|
| `local` | Nibgate DB / S3 blob | $0 | dev, default |
| `arweave` | pay-once, permanent | ~$2–5/GB one-time (a text post ≈ fractions of a cent) | evergreen gated content |
| `ipfs` | content-addressed, pin to keep | pinning is recurring | short-lived, cheap |

Only ciphertext goes up. The plaintext exists only: in the creator's client at write
time, and in a legit unlocker's client after payment.

### Encryption scheme

- Content key `K` = random 256-bit AES-GCM key, generated in the creator's browser.
- Ciphertext = `AES-GCM(K, plaintext)`.
- `encryptedKey`: Tier 1 wraps `K` with a Nibgate server secret (HSM/env). Tier 2
  registers `K` under a Lit PKP so a Lit Action releases it only when rules pass.
- `contentHash = keccak256("nibshare:v1|ownerWallet|storageRef|plaintextPayload")`
  (same keccak commitment pattern as hub `Content` — `backend/src/server/hub/helpers.js`).

## Core flow

```
Creator: connect wallet -> write -> set price/expiry/whitelist
   -> client encrypts -> ciphertext+metadata to storage -> POST /api/nibshare
   -> short link  nibgate.xyz/s/<slug>
Viewer (human or agent): GET /s/<slug> -> 402 payment terms
   -> pays USDC via x402 (Circle Gateway, eip155:5042002)
   -> POST /api/nibshare/:slug/unlock
   -> rules checked (not expired, whitelisted, paid)
   -> key vended -> client decrypts -> plaintext
```

## API surface

Full contracts in [`docs/API.md`](./docs/API.md). Summary:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/nibshare` | SIWE signature | Create a share (stores ciphertext+metadata) |
| GET | `/api/nibshare/:slug/meta` | none | Public metadata (title, summary, price, expiry, whitelist flag) — never body |
| POST | `/api/nibshare/:slug/unlock` | x402 payment | Rules check -> vend key / return plaintext |
| DELETE | `/api/nibshare/:slug` | SIWE signature | Revoke (sets status=revoked; stops new unlocks) |
| GET | `/api/nibshare/mine` | SIWE signature | Creator's shares + earnings |

Rules check at unlock time: `status == active AND (expiresAt IS NULL OR now < expiresAt)
AND (whitelist empty OR payer ∈ whitelist)`.

## Reusing existing Nibgate pieces

- **Payments:** the `POST /api/hub/pay` Circle Gateway x402 middleware pattern
  (`backend/src/server/routes/hub-routes.js`). Unlock reuses it with
  `recipient = ownerWallet`, `price = NibShare.price`.
- **Receipts:** `NibShareReceipt` mirrors `UnlockReceipt` (payer, txHash, amount).
- **SIWE auth:** existing session/SIWE flow for wallet ownership.
- **Keccak commitment:** same helper as hub content.

## Phasing (Tier 1 now, Tiers 2–3 later)

- **Tier 1 (ship):** `local`/`arweave` storage, server-vended keys, SIWE create,
  x402 unlock, short link. The schema already carries `keyProvider`, `storageProvider`,
  `storageRef`, `encryptedKey` so upgrades are non-breaking.
- **Tier 2 (decentralized keys):** Lit Protocol PKP + Lit Action enforcing
  payment/whitelist/expiry before decryption. Removes Nibgate as key-holder. Costs a
  second network + credits. Even Lit cannot revoke issued keys — only refuse new
  decryptions after expiry.
- **Tier 3 (decentralized metadata):** publish title/summary/price to the same
  storage; the hub catalog becomes an index of CIDs, not the source of truth.

## Threat model / what this does NOT do

- **`client` mode cannot take a copy back.** A viewer who decrypted once keeps a
  private copy even after entropy revocation. Their entitlement is refused going
  forward, but the copy persists. Choose `server` mode for hard revocation.
- **`server` mode handles all reads through Nibgate.** It revokes cleanly but is
  centralized; it does not preserve the decentralized-storage property for that share.
- **Does not prevent copy/paste during any legitimate read.** Even `server` mode shows
  the viewer plaintext in-session; a determined user can save it during the session.
- **Does not hide existence.** Ciphertext + metadata are public on decentralized
  storage, content-addressed by design. Confidentiality is the plaintext, via keys.
- **Trust assumptions:** `server` mode trusts Nibgate to enforce entitlements and hold
  the wrapping secret. `client` mode trusts storage providers to serve bytes honestly;
  integrity is enforced by `contentHash` regardless.

## Config

```
NIB_SHARE_KEY_SECRET        # AES-256-GCM wrapping secret for Tier 1 keys
NIB_SHARE_STORAGE           # local | arweave | ipfs (default local)
ARWEAVE_KEY_FILE            # JWK file for arweave uploads (when arweave)
IPFS_PIN_URL / IPFS_PIN_JWT # pinning service (when ipfs)
```

## Related

- **Storage deep-dive:** [`docs/STORAGE.md`](./docs/STORAGE.md) — where bytes live
  (Arc is payments-only; Arweave/IPFS hold bytes), real costs, upload timeline,
  media/streaming strategy, and why Arweave has no testnet.
- Payments rail: `backend/src/server/routes/hub-routes.js` (`/api/hub/pay`)
- Integrity commitment pattern: `backend/src/server/hub/helpers.js` (contentHash)
- Schema: `packages/cli/prisma/schema.prisma` (`NibShare`, `NibShareReceipt`)
