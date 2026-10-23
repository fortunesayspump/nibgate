---
title: ratingMessage
description: "Produce the canonical rating message with normalized resource defaults"
---

# client.ratingMessage

Produce the canonical rating message with normalized resource defaults. This is text to sign, not a signature or onchain submission.

## Signature

```typescript
ratingMessage(resource: NibgateResource | string, rating?: NibgateRating | number, options?: Record<string, unknown>): string;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `rating?` | `NibgateRating \| number` |
| `options?` | `Record<string, unknown>` |

## Returns

`string`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const message = client.ratingMessage(resource, 4);
```

## Source

[Declaration, line 121](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L121) · [Implementation, line 16](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/core/rating.js#L16) · [Client binding, line 49](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L49)

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
