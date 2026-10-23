---
title: gate
description: "Create a resource-scoped event and local unlock controller"
---

# client.gate

Create a resource-scoped event and local unlock controller. Local unlock state is a UI convenience; enforce paid access on the server.

## Signature

```typescript
gate(resource: NibgateResource | string, options?: NibgateGateOptions): NibgateGate;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgateGateOptions` |

## Returns

`NibgateGate`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const gate = client.gate(resource);
console.log(gate.resource.id);
```

## Source

[Declaration, line 98](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L98) · [Implementation, line 1](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/gate.js#L1) · [Client binding, line 52](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L52)

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

### NibgateGateOptions

```typescript
export type NibgateGateOptions = {
  client?: NibgateClient;
};
```

### NibgateGate

```typescript
export type NibgateGate = {
  resource: NibgateResource;
  content(extra?: Record<string, unknown>): boolean;
  view(extra?: Record<string, unknown>): boolean;
  track(eventName: string, payload?: Record<string, unknown>): boolean;
  unlockStarted(extra?: Record<string, unknown>): boolean;
  unlockCompleted(payment?: NibgatePayment): boolean;
  paymentCompleted(payment?: NibgatePayment): boolean;
  isUnlocked(): boolean;
  markUnlocked(payment?: NibgatePayment): boolean;
  unlock(handlerOrPayment?: NibgatePayment | ((resource: NibgateResource) => Promise<NibgatePayment> | NibgatePayment)): Promise<{ unlocked: true; resource: NibgateResource; payment: NibgatePayment }>;
  rate(rating?: NibgateRating | number, extra?: Record<string, unknown>): boolean;
};
```
