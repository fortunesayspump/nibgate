# keccak256

Calculates the Keccak256 hash of a byte array.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/keccak256.ts#L21-L31) · [Official reference](https://viem.sh/docs/utilities/keccak256)

## Signature

```ts
export function keccak256<to extends To = 'hex'>(
  value: Hex | ByteArray,
  to_?: to | undefined,
): Keccak256Hash<to>;
```

## Parameters

- **value**: `Hex | ByteArray`
- **to_** (optional): `to | undefined`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/keccak256.md).

```ts
import { keccak256 } from 'viem'

keccak256(new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33])
// 0x3ea2f1d0abf3fc66cf29eebb70cbd4e7fe762ef8a09bcc06c8edf641230afec0

keccak256('0xdeadbeef')
// 0xd4fd4e189132273036449fc9e11198c739161b4c0116a9a2dccdfa1c492006f1

// hash utf-8 string
keccak256(toHex('hello world'))
// 0x3ea2f1d0abf3fc66cf29eebb70cbd4e7fe762ef8a09bcc06c8edf641230afec0
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### Keccak256Hash

```ts
export type Keccak256Hash<to extends To> =
  | (to extends 'bytes' ? ByteArray : never)
  | (to extends 'hex' ? Hex : never)
```

### Keccak256ErrorType

```ts
export type Keccak256ErrorType =
  | IsHexErrorType
  | ToBytesErrorType
  | ToHexErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/keccak256.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/hash/keccak256.ts, lines 21–31.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
