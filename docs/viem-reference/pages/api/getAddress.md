# getAddress

Converts an address into an address that is checksum encoded.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/getAddress.ts#L64-L81) · [Official reference](https://viem.sh/docs/utilities/getAddress)

## Signature

```ts
export function getAddress(
  address: string,
  /**
   * Warning: EIP-1191 checksum addresses are generally not backwards compatible with the
   * wider Ethereum ecosystem, meaning it will break when validated against an application/tool
   * that relies on EIP-55 checksum encoding (checksum without chainId).
   *
   * It is highly recommended to not use this feature unless you
   * know what you are doing.
   *
   * See more: https://github.com/ethereum/EIPs/issues/1121
   */
  chainId?: number,
): Address;
```

## Parameters

- **address**: `string`
- **chainId** (optional): `number`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/getAddress.md).

```ts
import { getAddress } from 'viem'

getAddress('0xa5cc3c03994db5b0d9a5eEdD10Cabab0813678ac')
// '0xa5cc3c03994DB5b0d9A5eEdD10CabaB0813678AC'
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### ChecksumAddressErrorType

```ts
export type ChecksumAddressErrorType =
  | Keccak256ErrorType
  | StringToBytesErrorType
  | ErrorType
```

### GetAddressErrorType

```ts
export type GetAddressErrorType =
  | ChecksumAddressErrorType
  | IsAddressErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/getAddress.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/address/getAddress.ts, lines 64–81.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
