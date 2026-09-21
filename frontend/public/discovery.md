# Nibgate — Agent Discovery

## Overview

Nibgate is a verification, discovery, and unlock layer for creator-owned paid
content. Creators keep content on their own sites and integrate the `@nibgate/sdk`
package for gating, payments, and events. The hub verifies sources, indexes
public metadata, and serves Explore, the ledger, and reputation. Payments and
ratings settle on-chain via x402 on Arc (mainnet; testnet mirrors it — see Network).

## Endpoints

### Platform

| Endpoint | Description |
|---|---|
| `https://nibgate.xyz` | Landing page |
| `https://nibgate.xyz/explore` | Content discovery feed |
| `https://nibgate.xyz/ledger` | Public activity ledger |

### API

| Endpoint | Description |
|---|---|
| `GET /hub/explore/content?limit=N` | Explore feed — returns content with title, price, domain, image |
| `GET /hub/ledger?limit=N&domain=X` | Public ledger — recent views, unlocks, payments, ratings |
| `POST /hub/evt` | Track an event (view, unlock, rating, etc.) |
| `POST /hub/reputation/ratings/prepare` | Prepare an on-chain rating, returns content hash + contract address |
| `POST /hub/site/info` | Get site info by siteId + token |

### Creator sites

Any SDK-integrated site exposes machine-readable surfaces on its own domain:

| Pattern | Description |
|---|---|
| `https://{creator-domain}/nibgate.json` | Content manifest (metadata, price, access policy) |
| `https://{creator-domain}/api/nibgate/access?path=X` | Access endpoint (returns 402 for paid content) |

Hosted Subblogs at `https://{subdomain}.nibgate.xyz` are one convenience form of
a creator site; they expose the same `/nibgate.json` manifest and
`/api/nibgate/access` access endpoint.

### Nibshare links

Standalone paid shares (no creator site required) live on the API host:

| Pattern | Description |
|---|---|
| `GET https://api.nibgate.xyz/ns/{slug}` | Free → body directly; paid → 402 x402 challenge |
| `GET https://api.nibgate.xyz/nibshare/{slug}/manifest` | Public metadata manifest |

### On-Chain

| Contract | Address | Purpose |
|---|---|---|
| USDC | `0x360000...0000` | Payment token (ERC-20, 6 decimals, both networks) |
| Gateway | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | USDC deposits + burn intents (testnet; mainnet `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`) |
| Reputation | `0x9f27fd62e75f86a3c7addfdba443aab1f930e281` | On-chain content ratings (testnet; mainnet deploys separately) |
| Explorer | `https://testnet.arcscan.app` | Block explorer (testnet; mainnet `https://explorer.arc.io`) |

### Payment Flow

Every paid surface speaks standard x402: `GET` returns 402 with a
`PAYMENT-REQUIRED` header (base64 JSON: amount, chain, verifying contract),
and the settled content is returned once payment is verified.

**Fast path — Circle Agent Stack** (recommended; wallet, policies, and
nanopayments handled by the CLI):

```bash
circle services inspect "https://api.nibgate.xyz/ns/{slug}" --output json
circle services pay   "https://api.nibgate.xyz/ns/{slug}" \
  --address <agent-wallet> --chain ARC-TESTNET --output json
```

Works against any Nibgate URL (nibshare links, creator-site access endpoints).
The same URL shape works with any x402 client library. Gotchas:

- Nanopayments spend the **Gateway balance**, not the on-chain balance.
  If you get `Insufficient Gateway balance`, deposit first:
  `circle gateway deposit --address <addr> --chain ARC-TESTNET --amount 1 --method direct`
- Re-requesting an already-paid resource returns it again without a new charge.

**Raw path** (no Circle tooling):

1. `GET /api/nibgate/access?path=X` → 402 + `PAYMENT-REQUIRED` header
2. Decode header (base64 JSON) → contains amount, chain, verifying contract
3. Deposit USDC into Gateway contract via `deposit(amount)`
4. Create burn intent through Gateway client
5. Submit payment with `Payment-Signature` header
6. Settled content is returned

**Direct-transfer alternative** (on-chain USDC transfer, no Gateway deposit):

1. `GET /api/nibgate/access?path=X&rail=transfer&wallet=<payer>` → 402
   challenge JSON with the seller `recipient` and `amount`
2. Broadcast a plain ERC-20 `transfer(recipient, amount)` of USDC (6 decimals)
   on Arc Testnet and wait for the receipt
3. Sign the EIP-191 message
   ``Nibgate transfer ownership\ntx:<txHash lowercase>\nresource:<path>`` with
   the **paying** wallet
4. Retry the same GET with `x-nibgate-transfer-tx: <txHash>` plus
   `x-nibgate-tx-owner: <signature>` → settled content is returned

The signature binds the public txHash to your wallet and this exact resource;
missing or mismatched proofs are rejected (`transfer-ownership-proof-required`,
`transfer-owner-mismatch`) and each txHash unlocks only one resource.

**Recording:** all settled payments are recorded server-side at the payment
layer — receipts, metrics, and the public ledger treat machine payers exactly
like browser users. No client-side event reporting is required. Each receipt
carries the 1% protocol fee.

### Rating Flow

1. `POST /hub/reputation/ratings/prepare` with `contentId`, `walletAddress`, `ratingValue`
2. Returns `contentHash`, `contractAddress`
3. Call `rateContent(contentHash, rating, reviewHash, unlockRef)` on the reputation contract
4. Track via `POST /hub/evt` with event `content_rating`

### Network

Nibgate runs on two Arc networks. **Mainnet is the default surface**
(`nibgate.xyz`, chain ID 5042); testnet mirrors it for staging
(`testnet.nibgate.xyz`, chain ID 5042002). Balances, unlocks, and reputation
do NOT cross networks.

| | Mainnet | Testnet |
|---|---|---|
| Site | `https://nibgate.xyz` | `https://testnet.nibgate.xyz` |
| API | `https://api.nibgate.xyz` | `https://testnet-api.nibgate.xyz` |
| Nibshare links | `https://nibgate.xyz/ns/{slug}` | `https://testnet.nibgate.xyz/ns/{slug}` |
| Subblogs | `https://{sub}.nibgate.xyz` | `https://{sub}.testnet.nibgate.xyz` |
| Chain ID | 5042 (`eip155:5042`) | 5042002 (`eip155:5042002`) |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.arc.io` | `https://testnet.arcscan.app` |
| Gateway API | `https://gateway-api.circle.com` | `https://gateway-api-testnet.circle.com` |
| Gateway wallet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Gateway minter | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

- USDC is `0x360000...0000` on both networks; Arc domain is 26 on both.
- Native gas: USDC (18 decimals for gas, 6 decimals for ERC-20).
- Reputation contract: testnet `0x9f27fd62e75f86a3c7addfdba443aab1f930e281`; mainnet deploys separately.
