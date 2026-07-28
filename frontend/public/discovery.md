# Nibgate — Agent Discovery

## Overview

Nibgate is a pay-per-article blogging network on Arc Testnet. Content is behind
x402 micropayment walls. Payments and ratings settle on-chain.

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
| `GET /api/hub/explore/content?limit=N` | Explore feed — returns content with title, price, domain, image |
| `GET /api/hub/ledger?limit=N&domain=X` | Public ledger — recent views, unlocks, payments, ratings |
| `POST /api/hub/evt` | Track an event (view, unlock, rating, etc.) |
| `POST /api/hub/reputation/ratings/prepare` | Prepare an on-chain rating, returns content hash + contract address |
| `POST /api/hub/site/info` | Get site info by siteId + token |

### Blogs

| Pattern | Description |
|---|---|
| `https://{subdomain}.nibgate.xyz` | Individual creator blogs |
| `GET /api/blog/posts` | List posts for a blog |
| `GET /api/nibgate/access?path=X` | Access endpoint (returns 402 for paid content) |

### On-Chain

| Contract | Address | Purpose |
|---|---|---|
| USDC | `0x360000...0000` | Payment token (ERC-20, 6 decimals) |
| Gateway | `0xEBc7Ce5E11F7d8cB0e33Af63b53B964B8a47BB67` | USDC deposits + burn intents |
| Reputation | `0x9f27fd62e75f86a3c7addfdba443aab1f930e281` | On-chain content ratings |
| Explorer | `https://testnet.arcscan.app` | Block explorer for Arc Testnet |

### Payment Flow

1. `GET /api/nibgate/access?path=X` → returns 402 with `PAYMENT-REQUIRED` header
2. Decode header (base64 JSON) → contains amount, chain, verifying contract
3. Deposit USDC into Gateway contract via `deposit(amount)`
4. Create burn intent through Gateway client
5. Submit payment with `Payment-Signature` header
6. Settled content is returned

### Rating Flow

1. `POST /api/hub/reputation/ratings/prepare` with `contentId`, `walletAddress`, `ratingValue`
2. Returns `contentHash`, `contractAddress`
3. Call `rateContent(contentHash, rating, reviewHash, unlockRef)` on the reputation contract
4. Track via `POST /api/hub/evt` with event `content_rating`

### Network

- Chain ID: 5042002
- RPC: `https://rpc.testnet.arc-node.thecanteenapp.com/v1/{key}`
- Native: USDC (18 decimals for gas, 6 decimals for ERC-20)
