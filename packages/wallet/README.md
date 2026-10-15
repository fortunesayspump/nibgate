# @nibgate/wallet

Single Nibgate wallet standard for React apps: one shared Reown AppKit + wagmi stack, chain guard for Arc mainnet + testnet, human-readable error mapping, SIWE sign-in, Gateway balance UI, paid-content unlocking, and onchain rating — all importable from one package so AppKit modal state and WagmiProvider context are never duplicated.

## Install

```bash
npm install @nibgate/wallet
```

Peer-style companions you likely want: `@tanstack/react-query`, `wagmi`, `@reown/appkit` are re-exported from `@nibgate/wallet/react` — always import those primitives from this package, not directly, so every Nibgate consumer shares a single instance.


For a React host, the validated companion stack is Reown AppKit/adapter
`1.8.21`, wagmi `3.6.21`, React/ReactDOM `19.2.4`, and React Query `5.101.2`.
Keep React and the wallet provider in one module graph. The application root
should pin transitive wallet integrations with these npm `overrides` (or the
same keys under `pnpm.overrides` when using pnpm 10):

```json
{
  "overrides": {
    "viem": "2.54.1",
    "@wagmi/connectors": "8.0.20",
    "@coinbase/cdp-sdk": "1.51.2"
  }
}
```

This keeps fresh installations on the tested connector/core and x402 peer graph.

## Quick start

```jsx
'use client';
import { NibgateWalletProvider } from '@nibgate/wallet/react';

export function Providers({ children }) {
  return <NibgateWalletProvider>{children}</NibgateWalletProvider>;
}
```

### Connect

```jsx
import { useNibgateConnect } from '@nibgate/wallet/react';

const { address, isConnected, connect, disconnect } = useNibgateConnect();
```

### Unlock paid content

```jsx
import { NibgateUnlock, useNibgateUnlock } from '@nibgate/wallet/react';

<NibgateUnlock
  resource={{ id, title, price, recipient }}
  render={(state) => state.unlocked ? <Content body={state.payload?.content} /> : null}
/>
```

Or drive it yourself with `useNibgateUnlock()` — exposes `busy`, `checking`, `status`, `error`, `unlocked`, `payload`, `proof`, plus `connect`, `disconnect`, `unlock`, `clear`, `paymentRail`, `setPaymentRail`, and Gateway balance refreshers.

`NibgateUnlock` briefly confirms newly verified access before revealing its
children (600 ms confirmation, then a 280 ms fade). Its `onUnlock` callback runs
at reveal time so a host cannot remove the confirmation prematurely. Restored
access skips this delay and animation. Reduced-motion users receive static
feedback with a 120 ms transition interval. Navigating away, disconnecting,
changing wallets/providers, or clearing access cancels a pending reveal. The
lower-level `useNibgateUnlock` callback still reports verification immediately.

Offline transition and access-boundary regression checks:

```sh
node --test scripts/unlock-success-transition.test.mjs scripts/unlock-access-feedback.test.mjs
```

The shared React unlock component starts on **Direct** (`transfer`) when no
`resource.paymentRail` is supplied. Set it to `gateway` to start on Gateway;
users can still switch either way, and rerenders do not reset their choice.
The shared tip component already uses Direct. This UI default does not change
server, creator-settings, or Gateway-specific SDK defaults.

### Gateway balance display and deposit

```jsx
import { GatewayWalletUI } from '@nibgate/wallet/react';
```

Renders buyer wallet balance and Circle Gateway balance with deposit flow.

The wallet 0.4.29 Gateway safety update uses only the AppKit-selected EVM provider.
The displayed account must match that provider, and every transaction explicitly
names the build's active Arc chain. A rejected switch or changed wallet stops the
next send. Approval must be successfully mined before deposit is requested;
deposit/withdraw success requires its own matching receipt and transaction data.

`useGatewayTransfer(address)` shares this behavior with custom React UIs. It
returns `run(kind, amount)`, `reset()`, `repairConnection()`, `busy`, `status`, and `transfer` (the saved
amount, action, status, approval hash, and transfer hash). `run()` resolves to the
confirmed transfer or `null` with visible status on failure. `reset()` checks a
terminal receipt before clearing it; it never starts another transfer itself.

Pending hashes are kept in same-origin, same-tab session storage, including
across a modal close or page reload. Resume preserves the original action and
amount and checks the saved hash instead of resubmitting it. If only approval
was submitted, resume confirms that approval before requesting the deposit.
Closing a modal during approval prevents the later deposit request; it cannot
cancel a transaction already submitted to the wallet. If the wallet response is
lost before a hash is saved, or a transaction is replaced/cancelled, the flow
fails closed: inspect wallet activity before any further payment. Recovery does
not span other tabs, devices, cleared session storage, or closed browsing
sessions. These changes are included in wallet `0.4.29`.
Use one shared wallet module instance per page. Concurrent transfers from
independent SDK bundles (for example, separately bundled CDN and React clients)
do not share an in-flight lock and are not supported.

The Gateway hook checks the selected provider's RPC before each new transaction
request. Both Gateway UIs provide an explicit **Repair wallet connection** action.
It requests the official Arc RPC through the selected wallet and verifies that
wallet's connection is responding; it does not prove the wallet overwrote an
existing RPC setting. Wallets that retain the old RPC may require the manual
network-edit steps shown by the repair error. `repairConnection()` preserves the
saved transaction and returns a boolean; it never retries a payment or resumes
the deposit automatically. Resume is a separate user action. An interrupted send
without a saved hash remains blocked after repair for wallet-activity review.

Offline regression checks (no live wallet or RPC):

```bash
node --test scripts/gateway-transactions.test.mjs scripts/gateway-hook.test.mjs
```

The hook tests execute the real hook body with stubbed React, AppKit, and viem
boundaries. A full frontend build and real browser-wallet validation are separate
gates.

### Onchain rating

```jsx
import { NibgateRatingUI } from '@nibgate/wallet/react';
```

Star rating written to the Nibgate reputation contract (constants exported as `NIBGATE_REPUTATION_*`).

## Entrypoints

| Import | What's inside |
|---|---|
| `@nibgate/wallet` | Chain constants (`ARC_TESTNET`, `isArcNetwork`), network switching (`ensureArcNetwork`, `switchToArcNetwork`, `waitForChainChange`), error maps (`WALLET_ERRORS`, `PAYMENT_ERRORS`, `getWalletErrorMessage`, `getPaymentErrorMessage`, `isWalletRejection`) |
| `@nibgate/wallet/react` | Provider, hooks, unlock + rating + gateway UI, SIWE helpers, session events, plus re-exports of wagmi / AppKit / react-query primitives |
| `@nibgate/wallet/siwe` | `createSignInMessage`, `parseSignInMessage`, `validateSignInMessage`, `verifySignature`, canonical `SIGN_IN_STATEMENT` |
| `@nibgate/wallet/unlock-key` | Stored payment-proof key helpers |
| `@nibgate/wallet/chain`, `/network`, `/errors` | Same as root, individually |

## Links

- Site: https://nibgate.xyz
- Docs: https://docs.nibgate.xyz
- Creator SDK guide: https://nibgate.xyz/skill.md
- Payer/agent guide: https://nibgate.xyz/discovery.md

## License

MIT

## Payment confirmation and safe retries

SDK 0.4.39 and wallet 0.4.30 support Arc mainnet (`eip155:5042`,
`https://api.nibgate.xyz`) and Arc testnet (`eip155:5042002`,
`https://testnet-api.nibgate.xyz`). Install `@nibgate/sdk@latest` and
`@nibgate/wallet@latest`. Configure the application network and matching Hub
together; an npm tag does not configure the network automatically.

A wallet transaction hash or Gateway signature means a proof was submitted,
not that the Hub recorded a successful tip. A standalone SDK tip without a Hub
verification response returns `status: 'pending'`. Only a successful Hub response
confirms `settled` (resolved tip) or `holdStatus: 'held'` (funded hold).

On an interrupted response, keep the original proof and exact request fields,
including the network, amount, payee and content metadata. Retry verification
with that same proof; never send a second payment to repair a missing receipt.
The matching completed proof returns HTTP 200 with `replayed: true` and its
existing receipt, without another Tip row or another Gateway settlement. Reusing a proof with different request fields
is rejected. Legacy proofs without the new verified binding fail closed.

HTTP 409 `payment-proof-already-used` means the proof is reserved or recorded
with a different or unverifiable binding. HTTP 409 `payment-verification-pending`
means its durable reservation has not completed. Stop automatic payment attempts;
inspect the existing transaction/receipt and reconcile ambiguous settlement with
the operator. Pending reservations are not automatically cleared or settled
again. A transport or server error after submission is not evidence that no
payment occurred. An unconfirmed direct-transfer receipt returns HTTP 402;
retrying its read-only verification is safe. This change uses the existing
`PaymentTxClaim` table, with no new schema migration. It does not recover a
facilitator settlement lost before database completion or add held-tip
claim/refund recovery.

### React pending-proof recovery

`useNibgateTip()` retains the submitted proof in memory while Hub confirmation is
incomplete. `tip()` and `retryVerification()` reuse that exact proof rather than
send another payment. The pending state is a component `useRef`, not durable
storage: a reload, unmount or remount loses this protection. Before paying again
after navigation, inspect the original transaction and existing Hub receipt.

`payment-proof-already-used` blocks the local attempt so the existing receipt can
be checked. `payment-verification-pending` keeps the proof and asks for
reconciliation; retrying verification remains possible, but cannot clear or
resettle an ambiguous backend reservation. The hook reports a verified receipt
only after a successful Hub response. A later UI callback failure must not prompt
another payment. Pending proof material must not be published or sent to analytics.


### Wallet RPC health and repair

A matching chain ID does not prove that an external wallet's saved RPC works.
`ensureArcNetwork(provider)` now reads the selected provider's actual chain ID
and a block number, including when a caller supplied a cached `currentChainId`.
`checkArcConnection(provider, { timeoutMs })` performs only bounded read requests;
it never adds a network, switches it, signs or submits a transaction. Successful
reads prove responsiveness, not broadcast availability or the wallet's saved URL.

`NibgateWalletProvider` shows a connection notice when its passive read check
fails. Healthy connections do not receive an RPC-change prompt. Tip and unlock
flows recheck before requesting payment; Gateway checks before each new send.
HTTP 404 classification is restricted to wallet requests, so a missing Hub API
route is not described as a wallet RPC problem. Error messages omit raw RPC
payloads, signatures, and credential-bearing URLs. Unsupported methods, account
authorization, cancellation, rate limiting, access denial, and timeouts remain
distinct outcomes.

Only call `repairArcNetwork(provider, { assertActive })` from a user-initiated
repair action. It suggests the active network's official public RPC through
`wallet_addEthereumChain`, switches the chain, and checks reads again. EIP-3085
does not guarantee that an existing RPC is overwritten. The result therefore
reports `requestedRpcUrl`, not an installed RPC URL; unsuccessful repair shows
manual settings. The optional `assertActive` callback should reject if the
selected provider/account changes while a wallet prompt is open. Cancellation
does not retry, and repair never retries a transaction or clears payment proof.

Offline RPC regressions: `node --test scripts/wallet-rpc-health.test.mjs`.
The suite uses stub providers and controlled React-function harnesses, without a
real browser, wallet, signature, or network call. Real Zerion/wallet validation
and deployment remain separate checks.


Standalone/CDN integrations can pass `{ chain: ARC_MAINNET }` or
`{ chain: ARC_TESTNET }` to `checkArcConnection`, `ensureArcNetwork`,
`switchToArcNetwork`, and `repairArcNetwork`. Omitting it keeps the build's
active-chain default. Only these two Arc IDs are accepted, and repair metadata
is resolved from the package's trusted constants rather than caller-provided
RPC fields. This keeps explicit mainnet integrations independent of a testnet
build default. Manual fallback names the selected target's official RPC.

The explicit-target health, ensure, and switch helpers also accept
`assertActive`, checked around asynchronous wallet requests. Standalone adapters
should supply a guard bound to the selected provider/account so a late response
cannot continue a network setup for a different selection.

Google wallet compatibility: wallet 0.4.30 checks already-authorized accounts before SIWE, closes the AppKit sheet before the embedded signature prompt, and configures Reown's Arc RPC routes on both networks. This avoids overlapping dialogs and Magic iframe restrictions on direct Arc RPC hosts. Nibgate's application RPC proxies remain read-only; wallet signing still requires user approval.
