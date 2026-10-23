---
title: client.normalizeContentType
description: "Map aliases such as audio to music and pdf to document"
---


Map aliases such as audio to music and pdf to document. Unknown or empty input falls back to article.

## Signature

```typescript
normalizeContentType(type?: string): NibgateContentType;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `type?` | `string` |

## Returns

`NibgateContentType`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const type = client.normalizeContentType("pdf");
```

## Source

[Declaration, line 124](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L124) · [Implementation, line 26](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/core/resource.js#L26) · [Client binding, line 98](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L98)

Pinned SDK 0.4.40 at `345fc04b984f01366cbe2a9f4064f22268d5d3f6`.

## Related types

### NibgateContentType

```typescript
export type NibgateContentType = 'music' | 'video' | 'article' | 'image' | 'document';
```
