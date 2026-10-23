---
title: validateResourceMetadata
description: "Standalone export only at runtime in v0.4.40"
---


Standalone export only at runtime in v0.4.40. The NibgateClient declaration incorrectly lists it as a method. Returns normalized resource, score, errors, warnings and ok; use this standalone import.

## Signature

```typescript
validateResourceMetadata(resource: NibgateResource | string, options?: Record<string, unknown>): NibgateMetadataValidation;
```

The signature above is declared on NibgateClient but only the standalone export exists at runtime.

## Parameters

| Parameter | Type |
| --- | --- |
| `resource` | `NibgateResource \| string` |
| `options?` | `Record<string, unknown>` |

## Returns

`NibgateMetadataValidation`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { validateResourceMetadata } from '@nibgate/sdk';
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const validation = validateResourceMetadata(resource);
console.log(validation.errors, validation.warnings);
```

## Source

[Declaration, line 123](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L123) · [Implementation, line 168](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/core/resource.js#L168)

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

### NibgateMetadataValidation

```typescript
export type NibgateMetadataValidation = {
  ok: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  resource: NibgateResource;
};
```
