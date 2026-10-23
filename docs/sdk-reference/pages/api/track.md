---
title: track
description: "Emit a custom event and payload"
---

# client.track

Emit a custom event and payload. Resource defaults are not automatically attached to this method.

## Signature

```typescript
track(eventName: string, payload?: Record<string, unknown>): boolean;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `eventName` | `string` |
| `payload?` | `Record<string, unknown>` |

## Returns

`boolean`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

client.track("preview_opened", { resourceId: resource.id });
```

## Source

[Declaration, line 102](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L102) · [Implementation, line 1](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/events.js#L1) · [Client binding, line 34](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L34)

Pinned SDK 0.4.40 at `345fc04b984f01366cbe2a9f4064f22268d5d3f6`.

## Related types
