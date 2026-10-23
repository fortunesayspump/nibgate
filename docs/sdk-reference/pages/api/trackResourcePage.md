---
title: client.trackResourcePage
description: "Validate metadata, emit content and view events, and return a gate"
---


Validate metadata, emit content and view events, and return a gate. Browser metadata warnings are enabled unless the implementation-only warn option is false.

## Signature

```typescript
trackResourcePage(resource: NibgateResource | string, options?: NibgatePageOptions): NibgateGate;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgatePageOptions` |

## Returns

`NibgateGate`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const page = client.trackResourcePage(resource, { source: "article-page" });
```

## Source

[Declaration, line 107](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L107) · [Implementation, line 6](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/track.js#L6) · [Client binding, line 55](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L55)

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

### NibgatePageOptions

```typescript
export type NibgatePageOptions = {
  source?: string;
  path?: string;
  referrer?: string;
  content?: Record<string, unknown>;
  view?: Record<string, unknown>;
  gateOptions?: NibgateGateOptions;
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
