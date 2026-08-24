# @nibgate/wallet

Single Nibgate wallet standard for React apps: one shared Reown AppKit + wagmi stack, chain guard for Arc Testnet, human-readable error mapping, SIWE sign-in, Gateway balance UI, paid-content unlocking, and onchain rating — all importable from one package so AppKit modal state and WagmiProvider context are never duplicated.

## Install

```bash
npm install @nibgate/wallet
```

Peer-style companions you likely want: `@tanstack/react-query`, `wagmi`, `@reown/appkit` are re-exported from `@nibgate/wallet/react` — always import those primitives from this package, not directly, so every Nibgate consumer shares a single instance.

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

### Gateway balance display and deposit

```jsx
import { GatewayWalletUI } from '@nibgate/wallet/react';
```

Renders buyer wallet balance and Circle Gateway balance with deposit flow.

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
