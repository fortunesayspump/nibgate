# Nibgate E2E

Living testbed for the production UI/UX + payments sweep, plus the earlier local
MetaMask harness work. Everything scripted runs against **production**
(`nibgate.xyz`, `api.nibgate.xyz`, Arc Testnet `eip155:5042002`, USDC as native
18-decimals token, ERC-20 wrapper `0x3600…0000`) unless it says `localhost`.

## Layout

- `harness/` — Playwright scripts + helper libraries.
  - `prod-lib.js` — shared helpers: mock-wallet install, connect/SIWE, share creation, balances.
  - `prod-*.js` — production phases (see What we ran).
  - `mm.js` + the `import-*`, `hub-*`, `subblogs-*` scripts — the earlier **real
    MetaMask extension** harness (slow, fragile selectors — superseded for UI
    speed by the mock-wallet approach, kept for reference/extension-specific work).
- `logs/` — raw run logs (`prod-*.log`) and earlier `*.log`.
- `scratch/` — `prod-state.json` (live test posts + slugs), fixtures, npm artifacts.
- `FINDINGS.md` — every observation so far: what works, UX bugs, blocked items.

## Dependencies

```bash
npm i @playwright/test playwright @johanneskares/wallet-mock viem
```

Wallet keys (Arc testnet, test-only, public hardhat keys):
- Seller `0x7099…79c8` = `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`
  (~13.49 USDC holder). **Blocklisted by all Arc RPCs for sending** (public key) —
  recipient-only. Used for SIWE-creation, not for transferring funds.
- Buyer `0x3C44…4293BC` = `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`
  (0 USDC + whatever we faucet it).

## Wallet strategy (why not real MetaMask UI)

`@johanneskares/wallet-mock` installs a headless EIP-1193/EIP-6963 provider into
the page. It signs **real EIP-712 / personal messages and transactions** with the
given private key — the same developer experience as MetaMask minus the popups,
which is exactly right for testing **our** dApp UI. Extension-UI-specific testing
is a separate job (Synpress or the MetaMask harness).

Limitations worked around:
- wallet-mock does not implement `eth_signTypedData_v4` → we shim it by signing
  EIP-712 via viem `account.signTypedData` (see run pattern in `prod-f.js`).
- The x402 "Hold to pay" button needs a **sustained 1.5s press**; drive it by
  dispatching `pointerdown` then `pointerup` 2.2s later in-page.

## Running

```bash
node harness/prod-f.js     # buyer matrix over scratch/prod-state.json posts
node harness/prod-a.js     # seller: create the 4 base posts
```

Set `PROD_BASE` to point at a local deployment if needed. Logs append under
`logs/`. State lives in `scratch/prod-state.json`.