---
title: client.unlockCompleted
description: "Emit unlock_completed after your verified flow"
---


Emit unlock_completed after your verified flow. The client method only emits; gate.unlockCompleted also marks local state.

## Signature

```typescript
unlockCompleted(resource: NibgateResource | string, payment?: NibgatePayment): boolean;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `payment?` | `NibgatePayment` |

## Returns

`boolean`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

client.unlockCompleted(resource, { paymentId: "verified-receipt-id" });
```

## Source

[Declaration, line 104](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L104) · [Implementation, line 1](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/events.js#L1) · [Client binding, line 40](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L40)

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

### NibgatePayment

```typescript
export type NibgatePayment = {
  revenue?: number;
  amount?: number;
  currency?: string;
  paymentId?: string;
  paymentProvider?: 'circle-gateway' | 'arc-testnet' | 'x402' | string;
  receiptUrl?: string;
  txHash?: string;
  chainId?: string | number;
  chainExplorerUrl?: string;
  payer?: string;
  recipient?: string;
  [key: string]: unknown;
};
```
