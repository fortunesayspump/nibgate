# Nibshare Storage: Arweave & friends

Everything we know (verified as of Aug 2026) about where content bytes live, what
they cost, and how media actually gets served. Nibshare's schema abstracts this behind
`storageProvider` / `storageRef`, so the provider is a pluggable detail.

## Division of labor: Arc is money, storage networks are bytes

**Arc does not do storage.** It is Circle's stablecoin L1 (USDC gas, sub-second
finality, x402, FX, tokenized assets) with a **permissioned validator set**. It has no
blob storage, no data availability for arbitrary content, and no storage-market
incentives. Building a storage network is a separate consensus problem (who holds the
bytes, proof-of-storage, incentive markets) — that's what Arweave, Filecoin, and Storj
each built from scratch over years.

So nibshare uses the **hybrid**:

| Layer | What it does | Where it lives |
|---|---|---|
| Money | x402 payment, USDC settlement | **Arc** (eip155:5042002) |
| Integrity | `contentHash` commitment | Arc on-chain + DB |
| Keys/access | entitlements, decryptMode | Nibgate backend (Tier 1) / Lit (Tier 2) |
| Bytes | ciphertext + public metadata | **Arweave** (default), IPFS, or local |

This is not a compromise — it's the correct division. Rebuilding storage on Arc would
mean re-inventing Filecoin, worse.

## Where Arweave actually stores content

On the hard drives of a permissionless network of independent node operators
(miners), worldwide — not in one data center. Uploaded data is replicated across many
nodes; the **blockweave** design makes every miner keep the full historical dataset
(Proof of Access / SPoRA: mining a block requires proving access to random old data),
which economically forces them to hold your bytes. **Gateways** (AR.IO, `arweave.net`)
mirror the data for fast HTTP retrieval.

So "where" = thousands of independent hard drives, incentivized to keep your content
forever. Content is public by design — which is exactly why nibshare only ever uploads
**ciphertext** (see README threat model).

## Cost

One-time, per-byte, paid in AR. Live calculator: `ar-fees.arweave.net`.

- Typical range: **~$2–8 per GB** (network fee + current AR price; AR ≈ $1.74, ATH $89,
  so USD cost moves with AR — the byte fee is what's stable).
- A text post (~50 KB): **fractions of a cent**
- A photo: **< $0.01**
- A **500 MB video**: **~$1–4 one-time**
- A 13 GB file (per Arweave): **~$87** (vs ~$35M on Bitcoin, ~$780M on Ethereum)

## Upload timeline

| Phase | Duration | Notes |
|---|---|---|
| 1. Upload bytes to bundler | **bounded by your upload speed** | 500 MB ≈ 3–4 min @ 20 Mbps, ~1 min @ 100 Mbps |
| 2. Get `ar://<txid>` | **seconds** | Bundler (Irys/ArDrive) returns the id immediately and serves it from its own gateway cache — reads work right away |
| 3. On-chain confirmation | **minutes → ~1 hr** | Bundler batches many uploads into one on-chain tx; you don't block on this |

## Delivery & media strategy

Arweave is **not a streaming CDN.** Gateways serve files over HTTP, but a single large
blob will buffer for real users. For media:

- **Images / small files:** fetch from gateway directly. Fine.
- **Video:** segment it (HLS) and put a CDN in front of the gateway for smooth
  playback. Large single-file MP4s work but stream poorly.
- **Gated video (nibshare):** AES-GCM can't seek or stream by default, so encrypt
  **per segment** (4–10s chunks, each with its own key), and grant segment keys after
  the x402 unlock. This is how DRM streams work; nibshare does the same without a
  DRM license server.
- **Bandwidth cost** depends on `decryptMode`:
  - `client`: viewer downloads the ciphertext once, decrypts locally — cheap for us
    (recommended for media).
  - `server`: we decrypt and stream — that is a **real bandwidth bill** on Nibgate;
    avoid for large media.

## Testnets: there are none for storage

Arweave has **no public testnet for storage.** You develop directly on **mainnet**,
which is fine because writes cost cents. What *does* have testnets:

- **AO** (Arweave's compute layer) — testnet existed 2024, AO mainnet live Feb 2025.
  Not content storage.
- **WeaveVM** (separate EVM DA chain over Arweave, ~$0.05/MB) — has a testnet + faucet.
  Not needed for nibshare.
- **NASA** (Arweave gateway-incentive test program) — network staking, not content.

Practical dev flow: register a bundler key with a small AR balance, upload throwaway
ciphertext during dev, accept that it's on real Arweave forever (that's the point).

## Provider comparison

| Provider | Model | Cost | Choose when |
|---|---|---|---|
| `local` | DB / blob | $0 | dev, default |
| `arweave` | permanent, one-time | ~$2–8/GB once (text = <$0.01) | evergreen content; cheap permanence |
| `ipfs` | content-addressed + pin | pinning is recurring (~$5–20/mo scale) | mutable/ephemeral, CDN-friendly delivery |
| `storj` (future) | S3-like, client-encrypted by default | usage-based | big media where confidentiality-by-default matters |

## Upload path by size

- **Small content (text/images):** client-side upload in the create flow → storage
  adapter → pass back `storageRef`. Simple, no server bandwidth.
- **Large media (video):** server-side upload to the adapter (browser/proxy upload
  limits + timeouts make client-side upload of 500 MB unreliable), or direct-to-adapter
  upload with the `storageRef` returned to the create call.

## Config

```
NIB_SHARE_STORAGE           # local | arweave | ipfs (default local)
ARWEAVE_KEY_FILE            # JWK file for arweave uploads (when arweave)
ARWEAVE_UPLOAD_URL          # bundler endpoint (Irys default) when arweave
IPFS_PIN_URL / IPFS_PIN_JWT # pinning service (when ipfs)
```

The storage adapter interface (`put` / `get`) and the schema fields
(`storageProvider`, `storageRef`, `ciphertextUrl`, `metadataUrl`) already anticipate
switching providers without a migration.
