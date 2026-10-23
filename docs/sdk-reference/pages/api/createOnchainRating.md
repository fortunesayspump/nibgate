---
title: client.createOnchainRating
description: "Bind rating controls to the onchain flow"
---


Bind rating controls to the onchain flow. autoMount defaults true. Supply payment or getUnlockRef so ratings can reference a verified unlock; rate can request a wallet transaction.

## Signature

```typescript
createOnchainRating(resource: NibgateResource | string, options?: NibgateOnchainRatingUiOptions): NibgateOnchainRatingController;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgateOnchainRatingUiOptions` |

## Returns

`NibgateOnchainRatingController`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const rating = client.createOnchainRating(resource, { provider, autoMount: false, payment: { paymentId: "verified-receipt-id" } });
rating.setVisible(true);
```

## Source

[Declaration, line 117](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L117) · [Implementation, line 23](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/rating-ui.js#L23) · [Client binding, line 85](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L85)

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

### NibgateOnchainRatingUiOptions

```typescript
export type NibgateOnchainRatingUiOptions = NibgateOnchainRatingOptions & {
  status?: string | HTMLElement | null;
  ratingTarget?: string | HTMLElement | null;
  ratingButtons?: string;
  buttons?: string | HTMLElement | HTMLElement[] | null;
  payment?: NibgatePayment | null;
  visible?: boolean;
  autoMount?: boolean;
  pendingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  gateOptions?: NibgateGateOptions;
  getPaymentId?: () => string | undefined | null;
  getUnlockRef?: () => string | undefined | null;
  onStatus?: (message: string) => void;
  onRated?: (result: NibgateOnchainRatingResult) => void;
  onError?: (error: unknown) => void;
};
```

### NibgateOnchainRatingController

```typescript
export type NibgateOnchainRatingController = {
  resource: NibgateResource;
  rate(input?: Partial<NibgateOnchainRatingOptions> & { value?: number | string }): Promise<NibgateOnchainRatingResult>;
  mount(): NibgateOnchainRatingController;
  setPayment(payment?: NibgatePayment | null): NibgatePayment | null;
  setVisible(isVisible: boolean): boolean;
};
```
