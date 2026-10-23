---
title: client.payAndUnlockResource
description: "POST resource and optional payPayload to payPath (default /api/nibgate/pay)"
---


POST resource and optional payPayload to payPath (default /api/nibgate/pay). Requires both HTTP success and payload.ok, stores proof, and marks the local gate unlocked. The server owns payment verification.

## Signature

```typescript
payAndUnlockResource(resource: NibgateResource | string, options?: NibgatePaymentOptions): Promise<NibgatePaymentResult>;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgatePaymentOptions` |

## Returns

`Promise<NibgatePaymentResult>`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const result = await client.payAndUnlockResource(resource, { payPath: "/api/nibgate/pay" });
if (result.ok) console.log(result.payment);
```

## Source

[Declaration, line 119](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L119) · [Implementation, line 178](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/access.js#L178) · [Client binding, line 91](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L91)

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

### NibgatePaymentOptions

```typescript
export type NibgatePaymentOptions = {
  source?: string;
  payPath?: string;
  payMethod?: string;
  payHeaders?: Record<string, string>;
  payPayload?: Record<string, unknown>;
  paymentProvider?: string;
  paymentMessage?: string;
  paymentSuccessMessage?: string;
  paymentErrorMessage?: string;
  gateOptions?: NibgateGateOptions;
  onStatus?: (message: string) => void;
};
```

### NibgatePaymentResult

```typescript
export type NibgatePaymentResult =
  | { ok: true; status: number; payload: Record<string, unknown>; payment: NibgatePayment; resource: NibgateResource; response: Response }
  | { ok: false; status: number; payload?: Record<string, unknown>; resource: NibgateResource; response: Response };
```
