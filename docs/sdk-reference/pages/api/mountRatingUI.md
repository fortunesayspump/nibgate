---
title: mountRatingUI
description: "Mount a five-star telemetry UI, or return null without a browser/target"
---

# client.mountRatingUI

Mount a five-star telemetry UI, or return null without a browser/target. Known v0.4.40 bug: star click invokes .catch on the boolean returned by rateResource. Controller rate signature also differs from its declaration; prefer rateResource until fixed.

## Signature

```typescript
mountRatingUI(resource: NibgateResource | string, options?: NibgateRatingUiOptions): NibgateRatingUiController | null;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgateRatingUiOptions` |

## Returns

`NibgateRatingUiController | null`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const ui = client.mountRatingUI(resource, { target: "#rating", label: "Rate this article" });
ui?.setRating(4);
// Do not use this version's broken click handler in production.
```

## Source

[Declaration, line 118](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L118) · [Implementation, line 110](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/rating-ui.js#L110) · [Client binding, line 88](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L88)

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

### NibgateRatingUiOptions

```typescript
export interface NibgateRatingUiOptions {
  target?: string | HTMLElement;
  label?: string;
  gateOptions?: Record<string, unknown>;
}
```

### NibgateRatingUiController

```typescript
export interface NibgateRatingUiController {
  resource: NibgateResource;
  container: HTMLElement;
  setRating(value: number): void;
  rate(resource: NibgateResource | string, input?: Record<string, unknown>): ReturnType<typeof rateContentOnchain>;
}
```
