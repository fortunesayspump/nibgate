---
title: createCircleGatewayBrowserAdapter
description: "Lazily import the Gateway adapter"
---

# client.createCircleGatewayBrowserAdapter

Lazily import the Gateway adapter. Supply signer or getSigner; the adapter signs typed data when pay is invoked. No payment is performed merely by creating it.

## Signature

```typescript
createCircleGatewayBrowserAdapter(options: NibgateCircleGatewayBrowserAdapterOptions): Promise<NibgateCircleGatewayBrowserAdapter>;
```



## Parameters

| Parameter | Type |
| --- | --- |
| `options` | `NibgateCircleGatewayBrowserAdapterOptions` |

## Returns

`Promise<NibgateCircleGatewayBrowserAdapter>`

## Example

App-supplied identifiers such as provider, signer, walletCheckout, sendTransfer, signOwnership and verifiedPaymentSignature represent your configured wallet integration or verified result. These are usage examples, not an automatically executed checkout.

```typescript
import { createNibgate } from '@nibgate/sdk';
const client = createNibgate();
const resource = { id: 'article-1', title: 'Example article', type: 'article', price: '1', url: 'https://creator.example/articles/1' };

const adapter = await client.createCircleGatewayBrowserAdapter({ signer });
```

## Source

[Declaration, line 111](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/index.d.ts#L111) · [Implementation, line 8](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/evm-gateway.js#L8) · [Client binding, line 67](https://github.com/fortunesayspump/nibgate/blob/345fc04b984f01366cbe2a9f4064f22268d5d3f6/packages/nibgate/src/browser/client.js#L67)

Pinned SDK 0.4.40 at `345fc04b984f01366cbe2a9f4064f22268d5d3f6`.

## Related types

### NibgateCircleGatewayBrowserAdapterOptions

```typescript
export type NibgateCircleGatewayBrowserAdapterOptions = {
  signer?: NibgateEvmTypedDataSigner;
  getSigner?: () => Promise<NibgateEvmTypedDataSigner> | NibgateEvmTypedDataSigner;
  network?: string;
  chainId?: number | string;
  clientModule?: Record<string, unknown>;
};
```

### NibgateCircleGatewayBrowserAdapter

```typescript
export type NibgateCircleGatewayBrowserAdapter = {
  signer: NibgateEvmTypedDataSigner;
  network: string;
  pay(input: NibgateCheckoutInput): Promise<NibgateCheckoutResult>;
};
```
