# Nibgate reputation contract

Nibgate uses x402/Gateway-style payments for unlocks and an ERC-8004-style onchain registry for reputation.

The payment does not go through this contract. Creator sites still receive unlock payments directly through their configured rail. After a wallet or agent unlocks content, it can submit a rating transaction to `NibgateReputation`.

## Contracts

- `NibgateReputationV2`: current upgradeable rating implementation with `rateContent(bytes32 contentId, uint8 rating, bytes32 reviewHash, string unlockRef)`.
- `legacy/NibgateReputation.sol`: V1 implementation and the still-used minimal ERC-1967 `NibgateReputationProxy`. Testnet's proxy was upgraded to V2; moving the source does not change that proxy.
- `legacy/NibgateSpenderV2.sol`: retired capped direct-tip float for Dr. Nib. Both deployed V2 instances are paused and custody-rotated; V1, V2 and their tests remain under `legacy/` solely for reproducibility and historical inspection. The immutable deploy artifact remains in `deploy-artifacts/` so recorded deployments can be decoded.

## Deployed contract inventory

Checked against Arc RPC bytecode and Sourcify on 24 Oct 2026. `match` is
Sourcify's reproducible source match; it is not a security audit.

| Contract | Arc mainnet (5042) | Arc testnet (5042002) | Runtime status |
|---|---|---|---|
| `NibgateReputationProxy` | `0xbe8e49f6b60024c95124e723c4c487874873d7f1` | `0x9f27fd62e75f86a3c7addfdba443aab1f930e281` | active proxy; Sourcify `match` |
| `NibgateReputationV2` | `0x84545d2ca80c0e96afa0ef3d8d5a36cf959cafb6` | `0x51c061f749561a26cc9b34e3a90027d534e8635e` | active implementation; Sourcify `match` |
| `GatewayFeeWalletFactory` | `0x216e92af9530a0d45fb0056c2ff62e782c1caa03` | `0x1afce8d4b7b6e2ac2b74eedb0fe719866b64f524` | active; Sourcify `match` |
| `AgenticCommerce` | `0xF08bB50BC833C7Bff25b60Fe1456f1235A0a4037` | `0x5135ae9be828be42b63f176848a7b720aedf4c58` | active ERC-8183 core; Sourcify verified |
| `NibgateRunSplitter` | `0x1Ad56C6d8b85ac7167a227a3a520Eb5aD349a628` | `0xFE5894a5A2fC4d7f6E0E70394209467D5A7bf1ef` | active post-23-Oct keeper migration; Sourcify `match` |
| `TipHoldingFactory` | `0x3b25846c3332fcb8140e2ab60aad2b7fb401fe87` | `0xf127a645d7C02a12E0a93B135F8aCF9c3332E518` | active immutable V1; Sourcify `match` |

The factories create deterministic child contracts rather than pointing at a
shared implementation: `GatewayFeeWalletFactory` creates per-creator fee
wallets and `TipHoldingFactory` creates per-domain holding wallets. Those
children do not have one fixed address per network. `TipHoldingFactoryV2` and
`TipHoldingWalletV2` are source/test candidates only and are **not deployed or
routed**. Both Spender generations are paused after the 23 Oct custody
migration; their historical addresses remain in the deployment JSON.

Authoritative machine records are `deployments/arc-mainnet.json`,
`deployments/arc-testnet.json`, and `deployments/arc-testnet-spender.json`.
They include creation transactions, current and historical roles, migration
history, and source-verification results. Re-run the read-only check with:

```bash
node scripts/audit-sourcify-contracts.mjs
```

Run the guarded Arc testnet hold/refund proof with:

```bash
NIBGATE_LIVE_TESTNET_MONEY_FLOW=1 node scripts/verify-live-testnet-money-flow.mjs
```

The guarded script is hard-pinned to Arc testnet, the recorded factory and
on-chain keeper, and a 0.01 USDC hold/refund. It refuses any other signer and
retains a mode-0600 recovery file if execution stops after funding.

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
