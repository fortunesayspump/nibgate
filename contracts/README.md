# Nibgate reputation contract

Nibgate uses x402/Gateway-style payments for unlocks and an ERC-8004-style onchain registry for reputation.

The payment does not go through this contract. Creator sites still receive unlock payments directly through their configured rail. After a wallet or agent unlocks content, it can submit a rating transaction to `NibgateReputation`.

## Contracts

- `NibgateReputation`: upgradeable implementation with `rateContent(bytes32 contentId, uint8 rating, bytes32 reviewHash, string unlockRef)`.
- `NibgateReputationProxy`: minimal ERC-1967 proxy that delegates to the implementation.

`rating` is stored as `1-50`, where `48` means `4.8` stars.

`contentId` is explicitly versioned:

```text
keccak256("nibgate:content:v1|domain|externalContentId|canonicalUrl")
```

The `nibgate:content:v1` namespace is part of the identity. Future versions can add fields like metadata hash, content version hash, IPFS/Arweave pointers, or creator signatures without changing the meaning of old ratings.

The backend indexes `ContentRated` events, then only counts a rating when the rater wallet also has an unlock receipt for the same content.

## Backend env

```bash
NIBGATE_REPUTATION_CONTRACT=0x...
NIBGATE_REPUTATION_RPC_URL=https://...
NIBGATE_REPUTATION_CHAIN_ID=5042002
NIBGATE_REPUTATION_CHAIN_NAME="Arc Testnet"
```

## Deploy

```bash
forge build --contracts contracts --out contracts/out --cache-path contracts/cache
NIBGATE_DEPLOYER_PRIVATE_KEY=0x... NIBGATE_REPUTATION_OWNER=0x... node scripts/deploy-reputation.mjs
```

For local hackathon testing only, the script can use the repo e2e test deployer fallback:

```bash
ALLOW_E2E_DEPLOYER_FALLBACK=true node scripts/deploy-reputation.mjs
```

Use the printed proxy address as `NIBGATE_REPUTATION_CONTRACT`.

Optional:

```bash
NIBGATE_INDEXER_SECRET=...
```

## Package flow

Creator pages call `rateContentOnchain(resource, { contractAddress, siteId, token, indexUrl, paymentId })` after unlock.

The helper:

1. computes the Nibgate content hash;
2. sends the `rateContent` transaction from the connected wallet;
3. emits a pending rating event to the widget;
4. calls the backend index endpoint so the tx can be verified and counted.
