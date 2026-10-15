# Nibgate reputation contract

Nibgate uses x402/Gateway-style payments for unlocks and an ERC-8004-style onchain registry for reputation.

The payment does not go through this contract. Creator sites still receive unlock payments directly through their configured rail. After a wallet or agent unlocks content, it can submit a rating transaction to `NibgateReputation`.

## Contracts

- `NibgateReputationV2`: current upgradeable rating implementation with `rateContent(bytes32 contentId, uint8 rating, bytes32 reviewHash, string unlockRef)`.
- `legacy/NibgateReputation.sol`: V1 implementation and the still-used minimal ERC-1967 `NibgateReputationProxy`. Testnet's proxy was upgraded to V2; moving the source does not change that proxy.
- `NibgateSpenderV2`: capped, pausable direct-tip float for Dr. Nib. Recipients are open by default; the owner may enable an allowlist. The superseded V1 spender, its tests, and its deploy artifact are under `legacy/`.

`rating` is stored as `1-50`, where `48` means `4.8` stars.

`contentId` is explicitly versioned:

```text
keccak256("nibgate:content:v1|domain|externalId|url")
```

The `nibgate:content:v1` namespace is part of the identity. Future versions can add fields like metadata hash, content version hash, IPFS/Arweave pointers, or creator signatures without changing the meaning of old ratings.

The backend indexes `ContentRated` events, then only counts a rating when the rater wallet also has an unlock receipt for the same content.

## Backend env (testnet shown; mainnet in `contracts/deployments/arc-mainnet.json`)

```bash
NIBGATE_REPUTATION_CONTRACT=0x9f27fd62e75f86a3c7addfdba443aab1f930e281
NIBGATE_REPUTATION_RPC_URL=https://rpc.testnet.arc.io
NIBGATE_REPUTATION_CHAIN_ID=5042002
NIBGATE_REPUTATION_CHAIN_NAME="Arc Testnet"
```

Mainnet: `NIBGATE_REPUTATION_CONTRACT=0xbe8e49f6b60024c95124e723c4c487874873d7f1`, chain `5042`, RPC `https://rpc.mainnet.arc.io` — or just set `NIBGATE_NETWORK=mainnet` and let the defaults follow (explicit env always wins).

`NIBGATE_REPUTATION_CONTRACT` is optional for the hosted backend if you want the default Arc Testnet deployment above. Set it explicitly when deploying a new proxy or using another network.

## Deploy (testnet shown; prefix `NIBGATE_NETWORK=mainnet` for mainnet)

```bash
forge build --contracts contracts --out contracts/out --cache-path contracts/cache
NIBGATE_DEPLOYER_PRIVATE_KEY=0x... NIBGATE_REPUTATION_OWNER=0x... node scripts/deploy-reputation.mjs
```

For local hackathon testing only, the script can fall back to the repo e2e test deployer key:

```bash
E2E_BUYER_PRIVATE_KEY=0x... node scripts/deploy-reputation.mjs
```

The deployment script uses the V2 implementation and the proxy from the legacy source. Use the printed proxy address as `NIBGATE_REPUTATION_CONTRACT`.

For Dr. Nib, `scripts/deploy-drnib-spender.mjs` dry-runs by default. Set `DRNIB_SPENDER_NETWORK=testnet` or `mainnet`, `DRNIB_SPENDER_AGENT` to the deployed worker's **public** address, and use `--broadcast` only after inspecting the printed roles, cap, recipient setting, chain and gas. Testnet reads `ESCROW_KEEPER_KEY`; mainnet reads `NIBGATE_DEPLOYER_PRIVATE_KEY`. The testnet V2 deployment is recorded in `deployments/arc-testnet-spender.json`; the deployed V1 addresses remain there and in `deployments/arc-mainnet.json` for history.

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
