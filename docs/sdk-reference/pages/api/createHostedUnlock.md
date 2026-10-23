---
title: createHostedUnlock
description: "Wrap createEvmGatewayUnlock with hosted: true"
---

# client.createHostedUnlock

Wrap createEvmGatewayUnlock with hosted: true. The selected network chooses api.nibgate.xyz/hub/pay or testnet-api.nibgate.xyz/hub/pay; an explicit non-hosted accessPath still takes precedence.

## Signature

```typescript
createHostedUnlock(resource: NibgateResource | string, options?: NibgateEvmGatewayUnlockOptions): NibgateEvmGatewayUnlockController;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgateEvmGatewayUnlockOptions` |

## Returns

`NibgateEvmGatewayUnlockController`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const controller = client.createHostedUnlock(resource, { network: "eip155:5042002", provider, autoMount: false });
controller.destroy();
```

## Source

[Declaration, line 115](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L115) · [Implementation, line 475](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/evm-gateway.js#L475) · [Client binding, line 79](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L79)

Pinned SDK 0.4.40 at `345fc04b984f01366cbe2a9f4064f22268d5d3f6`.

## Related types

### NibgateResource

```typescript
export type NibgateResource = {
  id: string;
  title?: string;
  type?: NibgateContentType | string;
  contentType?: NibgateContentType | string;
  price?: string | number;
  paymentRail?: NibgatePaymentRail | string;
  amount?: string | number;
  recipient?: string;
  receiver?: string;
  receiverAddress?: string;
  payTo?: string;
  creatorWallet?: string;
  path?: string;
  route?: string;
  url?: string;
  imageUrl?: string;
  image?: string;
  description?: string;
  summary?: string;
  tags?: readonly string[] | string;
  access?: NibgateAccessMode | NibgateAccessPolicy;
  unlock?: NibgateUnlockMode | NibgateUnlockPolicy;
  ratingsEnabled?: boolean;
  enableRatings?: boolean;
  reputation?: {
    ratingsEnabled?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
```

### NibgateEvmGatewayUnlockOptions

```typescript
export type NibgateEvmGatewayUnlockOptions = {
  source?: string;
  hosted?: boolean;
  accessPath?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  network?: string;
  paymentProvider?: string;
  circleClientModule?: Record<string, unknown>;
  /** @deprecated The SDK now ships a native BatchEvmScheme — no CDN needed */
  circleClientModuleUrl?: string;

  /** Explicit selection takes precedence over an injected wallet, including null. */
  provider?: NibgateEvmGatewayProvider | null;
  /** Read the currently selected EIP-1193 provider; null never falls back to window.ethereum. */
  getProvider?: () => NibgateEvmGatewayProvider | null | undefined;
  connectButton?: string | Element | null;
  disconnectButton?: string | Element | null;
  unlockButton?: string | Element | null;
  clearButton?: string | Element | null;
  walletLabel?: string | Element | null;
  status?: string | Element | null;
  unlockedTarget?: string | Element | null;
  noWalletMessage?: string;
  challengeMessage?: string;
  paymentMessage?: string;
  successMessage?: string;
  disconnectMessage?: string;
  autoMount?: boolean;
  gateOptions?: NibgateGateOptions;
  onStatus?: (message: string) => void;
  onUnlock?: (result: NibgateAccessCheckResult) => void;
};
```

### NibgateEvmGatewayUnlockController

```typescript
export type NibgateEvmGatewayUnlockController = {
  resource: NibgateResource;
  connect(): Promise<string>;
  disconnect(): Promise<boolean>;
  unlock(): Promise<NibgateAccessCheckResult | { ok: false; status: number; error: string; resource: NibgateResource }>;
  /** Recovery status only; does not expose the payment signature. */
  getPendingPayment(): { network: string; address: string; submitted: boolean; canRetry: boolean } | null;
  /** Resubmit only the retained proof, without signing another payment. */
  retryVerification(): Promise<NibgateAccessCheckResult | { ok: false; status: number; error: string; resource: NibgateResource }>;
  /** Explicitly request official selected-chain RPC metadata; never resumes payment. */
  repairConnection(): Promise<{ chainId: number; blockNumber: string; checkedAt: number; requestedRpcUrl: string }>;
  /** Clears local access but preserves an unresolved payment proof. */
  clear(): void;
  hydrate(): Promise<void>;
  mount(): NibgateEvmGatewayUnlockController;
  destroy(): void;
  getProvider(): NibgateEvmGatewayProvider | null;
  getWalletAddress(): string;
};
```
