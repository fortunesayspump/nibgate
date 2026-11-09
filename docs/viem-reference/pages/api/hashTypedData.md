# hashTypedData

Calculates an Ethereum-specific hash in [EIP-712 format](https://eips.ethereum.org/EIPS/eip-712): `keccak256("\x19\x01" ‖ domainSeparator ‖ hashStruct(message))`.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/hashTypedData.ts#L46-L90) · [Official reference](https://viem.sh/docs/utilities/hashTypedData)

## Signature

```ts
export function hashTypedData<
  const typedData extends TypedData | Record<string, unknown>,
  primaryType extends keyof typedData | 'EIP712Domain',
>(
  parameters: HashTypedDataParameters<typedData, primaryType>,
): HashTypedDataReturnType;
```

## Parameters

- **parameters**: `HashTypedDataParameters<typedData, primaryType>`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/hashTypedData.md).

```ts
import { hashTypedData } from 'viem'

hashTypedData({
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  types: {
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
    },
    contents: 'Hello, Bob!',
  },
})
```

## Integration Notes

Use the exact EIP-712 domain and types of the integration being verified. This helper computes a digest; it does not submit or settle a payment.

## Exported Types in This Source File

### HashTypedDataParameters

```ts
export type HashTypedDataParameters<
  typedData extends TypedData | Record<string, unknown> = TypedData,
  primaryType extends keyof typedData | 'EIP712Domain' = keyof typedData,
> = TypedDataDefinition<typedData, primaryType>
```

### HashTypedDataReturnType

```ts
export type HashTypedDataReturnType = Hex
```

### HashTypedDataErrorType

```ts
export type HashTypedDataErrorType =
  | GetTypesForEIP712DomainErrorType
  | HashDomainErrorType
  | HashStructErrorType
  | ValidateTypedDataErrorType
  | ErrorType
```

### HashDomainErrorType

```ts
export type HashDomainErrorType = HashStructErrorType | ErrorType
```

### HashStructErrorType

```ts
export type HashStructErrorType =
  | EncodeDataErrorType
  | Keccak256ErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/hashTypedData.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/signature/hashTypedData.ts, lines 46–90.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
