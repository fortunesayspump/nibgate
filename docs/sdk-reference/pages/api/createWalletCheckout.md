---
title: createWalletCheckout
description: "Create an unlock controller around a required checkout/createPaymentSignature/pay callback"
---

# client.createWalletCheckout

Create an unlock controller around a required checkout/createPaymentSignature/pay callback. mount binds the button; unlock checks access and invokes checkout only after a challenge.

## Signature

```typescript
createWalletCheckout(resource: NibgateResource | string, options: NibgateWalletCheckoutOptions): NibgateWalletCheckoutController;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options` | `NibgateWalletCheckoutOptions` |

## Returns

`NibgateWalletCheckoutController`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const checkout = client.createWalletCheckout(resource, { checkout: walletCheckout, button: "#unlock" });
checkout.mount();
```

## Source

[Declaration, line 110](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L110) · [Implementation, line 19](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/checkout.js#L19) · [Client binding, line 64](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L64)

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

### NibgateWalletCheckoutOptions

```typescript
export type NibgateWalletCheckoutOptions = NibgateAccessCheckOptions & {
  button?: string | HTMLButtonElement | null;
  status?: string | HTMLElement | null;
  pay?: NibgateCheckoutHandler;
};
```

### NibgateWalletCheckoutController

```typescript
export type NibgateWalletCheckoutController = {
  resource: NibgateResource;
  unlock(extra?: Partial<NibgateWalletCheckoutOptions>): Promise<NibgateAccessCheckResult | NibgatePaymentSignatureResult>;
  mount(): { unlock(extra?: Partial<NibgateWalletCheckoutOptions>): Promise<NibgateAccessCheckResult | NibgatePaymentSignatureResult> };
};
```
