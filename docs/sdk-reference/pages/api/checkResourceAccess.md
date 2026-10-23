---
title: checkResourceAccess
description: "Fetch the access route (default /api/nibgate/access)"
---

# client.checkResourceAccess

Fetch the access route (default /api/nibgate/access). A 402 returns a challenge unless checkout or autoPay is configured. Network errors reject; inspect result.ok before using protected payload.

## Signature

```typescript
checkResourceAccess(resource: NibgateResource | string, options?: NibgateAccessCheckOptions): Promise<NibgateAccessCheckResult>;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `NibgateAccessCheckOptions` |

## Returns

`Promise<NibgateAccessCheckResult>`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const result = await client.checkResourceAccess(resource, { accessPath: "/api/nibgate/access?id=article-1" });
if (result.ok) console.log(result.payload);
```

## Source

[Declaration, line 108](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L108) · [Implementation, line 9](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/access.js#L9) · [Client binding, line 58](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L58)

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
