---
title: client.payWithTransfer
description: "Invoke a transfer checkout, obtain its transaction hash, optionally sign ownership, and call the access verifier"
---


Invoke a transfer checkout, obtain its transaction hash, optionally sign ownership, and call the access verifier. Hosted verification needs ownership proof; a public hash alone is insufficient. Transfer option/result type declarations are missing in v0.4.40.

## Signature

```typescript
payWithTransfer(resource: NibgateResource | string, options: NibgateTransferCheckoutOptions & NibgateAccessCheckOptions): Promise<NibgateAccessCheckResult>;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options` | `NibgateTransferCheckoutOptions & NibgateAccessCheckOptions` |

## Returns

`Promise<NibgateAccessCheckResult>`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const result = await client.payWithTransfer(resource, { sendTransfer, signOwnership, accessPath: "/api/nibgate/access?id=article-1" });
```

## Source

[Declaration, line 113](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L113) · [Implementation, line 41](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/transfer.js#L41) · [Client binding, line 73](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L73)

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

### NibgateAccessCheckOptions

```typescript
export type NibgateAccessCheckOptions = {
  source?: string;
  accessPath?: string;
  payPath?: string;
  autoPay?: boolean;
  retryAfterPay?: boolean;
  paymentSignature?: string;
  paymentRequiredHeader?: string;
  memo?: string;
  checkout?: NibgateCheckoutHandler;
  createPaymentSignature?: NibgateCheckoutHandler;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  payment?: NibgatePayment;
  paymentProvider?: string;
  checkingMessage?: string;
  challengeMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  gateOptions?: NibgateGateOptions;
  onStatus?: (message: string) => void;
};
```

### NibgateAccessCheckResult

```typescript
export type NibgateAccessCheckResult =
  | { ok: true; status: number; payload: Record<string, unknown>; payment: NibgatePayment | null; resource: NibgateResource; response: Response }
  | { ok: false; status: number; challenge?: Record<string, unknown>; error?: string; payload?: Record<string, unknown>; resource: NibgateResource; response: Response };
```
