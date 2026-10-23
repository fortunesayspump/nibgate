---
title: client.setupResourcePage
description: "Track the page and optionally bind a button to checkResourceAccess"
---


Track the page and optionally bind a button to checkResourceAccess. The browser handler disables the button while awaiting access; it does not render the protected payload for you.

## Signature

```typescript
setupResourcePage(resource: NibgateResource | string, options?: NibgatePageSetupOptions): NibgateGate;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgatePageSetupOptions` |

## Returns

`NibgateGate`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const page = client.setupResourcePage(resource, { button: "#unlock", status: "#status", accessPath: "/api/nibgate/access?id=article-1" });
```

## Source

[Declaration, line 120](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L120) · [Implementation, line 22](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/track.js#L22) · [Client binding, line 94](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L94)

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

### NibgatePageSetupOptions

```typescript
export type NibgatePageSetupOptions = NibgatePageOptions & NibgateAccessCheckOptions & {
  button?: string | HTMLButtonElement | null;
  status?: string | HTMLElement | null;
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
