---
title: client.createTransferCheckout
description: "Require sendTransfer (or transfer), then return a pay callback that converts its transaction hash into verification metadata"
---


Require sendTransfer (or transfer), then return a pay callback that converts its transaction hash into verification metadata. A server verifyTransfer hook must verify the real transfer. The exported TypeScript declaration references missing transfer types in v0.4.40.

## Signature

```typescript
createTransferCheckout(resource: NibgateResource | string, options: NibgateTransferCheckoutOptions): NibgateTransferCheckout;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options` | `NibgateTransferCheckoutOptions` |

## Returns

`NibgateTransferCheckout`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const checkout = client.createTransferCheckout(resource, { sendTransfer });
```

## Source

[Declaration, line 112](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L112) · [Implementation, line 5](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/transfer.js#L5) · [Client binding, line 70](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L70)

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

### NibgateTransferCheckoutOptions

This type is referenced but missing from the v0.4.40 declarations. Consult the linked implementation and the coverage notes.

### NibgateTransferCheckout

This type is referenced but missing from the v0.4.40 declarations. Consult the linked implementation and the coverage notes.
