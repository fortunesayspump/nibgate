---
title: rateContentOnchain
description: "Request an EVM account, prepare the content hash, switch to Arc, and send a rating transaction"
---

# client.rateContentOnchain

Request an EVM account, prepare the content hash, switch to Arc, and send a rating transaction. Returns a submitted txHash, not a finality guarantee; emits onchain_pending telemetry. Requires a valid rating and configured contract/provider.

## Signature

```typescript
rateContentOnchain(resource: NibgateResource | string, options: NibgateOnchainRatingOptions): Promise<NibgateOnchainRatingResult>;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options` | `NibgateOnchainRatingOptions` |

## Returns

`Promise<NibgateOnchainRatingResult>`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const submitted = await client.rateContentOnchain(resource, { provider, rating: 4, unlockRef: "verified-receipt-id" });
```

## Source

[Declaration, line 116](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L116) · [Implementation, line 141](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/reputation.js#L141) · [Client binding, line 82](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L82)

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

### NibgateOnchainRatingOptions

```typescript
export type NibgateOnchainRatingOptions = NibgateRating & {
  provider?: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  };
  contractAddress?: string;
  reputationContract?: string;
  siteDomain?: string;
  domain?: string;
  url?: string;
  contentId?: `0x${string}` | string;
  unlockRef?: string;
  review?: string;
  reviewHash?: string;
  paymentId?: string;
  actor?: 'human' | 'agent' | string;
  source?: string;
  prepareUrl?: string;
  indexUrl?: string;
  indexHeaders?: Record<string, string>;
  siteId?: string;
  token?: string;
};
```

### NibgateOnchainRatingResult

```typescript
export type NibgateOnchainRatingResult = {
  txHash: string;
  walletAddress: string;
  contentId: string;
  ratingValue: number;
  reviewHash: string;
};
```
