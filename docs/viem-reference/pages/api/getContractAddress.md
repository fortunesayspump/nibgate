# getContractAddress

Retrieves a contract address.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/getContractAddress.ts#L36-L39) · [Official reference](https://viem.sh/docs/utilities/getContractAddress)

## Signature

```ts
export function getContractAddress(opts: GetContractAddressOptions);
```

## Parameters

- **opts**: `GetContractAddressOptions`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/getContractAddress.md).

```ts
import { getContractAddress } from 'viem'

getContractAddress({
  from: '0xc961145a54C96E3aE9bAA048c4F4D6b04C13916b',
  nonce: 69420n
})
// '0xDf2e056f7062790dF95A472f691670717Ae7b1B6'
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### GetCreateAddressOptions

```ts
export type GetCreateAddressOptions = {
  from: Address
  nonce: bigint
}
```

### GetCreate2AddressOptions

```ts
export type GetCreate2AddressOptions =
  | {
      bytecode: ByteArray | Hex
      from: Address
      salt: ByteArray | Hex
    }
  | {
      bytecodeHash: ByteArray | Hex
      from: Address
      salt: ByteArray | Hex
    }
```

### GetContractAddressOptions

```ts
export type GetContractAddressOptions =
  | ({
      opcode?: 'CREATE' | undefined
    } & GetCreateAddressOptions)
  | ({ opcode: 'CREATE2' } & GetCreate2AddressOptions)
```

### GetCreateAddressErrorType

```ts
export type GetCreateAddressErrorType =
  | Keccak256ErrorType
  | GetAddressErrorType
  | ToBytesErrorType
  | ToRlpErrorType
  | ErrorType
```

### GetCreate2AddressErrorType

```ts
export type GetCreate2AddressErrorType =
  | ConcatErrorType
  | Keccak256ErrorType
  | GetAddressErrorType
  | IsBytesErrorType
  | PadErrorType
  | SliceErrorType
  | ToBytesErrorType
  | ToRlpErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/getContractAddress.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/address/getContractAddress.ts, lines 36–39.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
