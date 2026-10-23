---
title: rateResource
description: "Normalize a rating and emit content_rating"
---

# client.rateResource

Normalize a rating and emit content_rating. Returns a boolean, not a Promise, and does not send an onchain transaction.

## Signature

```typescript
rateResource(resource: NibgateResource | string, rating?: NibgateRating | number, extra?: Record<string, unknown>): boolean;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `rating?` | `NibgateRating \| number` |
| `extra?` | `Record<string, unknown>` |

## Returns

`boolean`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const sent = client.rateResource(resource, 4);
```

## Source

[Declaration, line 106](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L106) · [Implementation, line 10](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/rating-ui.js#L10) · [Client binding, line 46](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L46)

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

### NibgateRating

```typescript
export type NibgateRating = {
  rating?: number;
  stars?: number;
  ratingValue?: number;
  score?: number;
  walletAddress?: string;
  payer?: string;
  actor?: 'human' | 'agent' | string;
  paymentId?: string;
  txHash?: string;
  reviewHash?: string;
  message?: string;
  ratingMessage?: string;
  signature?: string;
  ratingSignature?: string;
  proofType?: 'onchain' | 'attested' | string;
  proof?: string;
  [key: string]: unknown;
};
```
