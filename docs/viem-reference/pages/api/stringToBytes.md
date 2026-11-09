# stringToBytes

Encodes a string, hex value, number or boolean to a byte array.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toBytes.ts#L238-L248) · [Official reference](https://viem.sh/docs/utilities/toBytes)

## Signature

```ts
export function stringToBytes(
  value: string,
  opts: StringToBytesOpts = {},
): ByteArray;
```

## Parameters

- **value**: `string`
- **opts** (optional): `StringToBytesOpts` Default expression: {}.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/toBytes.md).

```ts
import { stringToBytes } from 'viem'
const data = stringToBytes('Hello world!')
// Uint8Array([72, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 33])
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### ToBytesParameters

```ts
export type ToBytesParameters = {
  /** Size of the output bytes. */
  size?: number | undefined
}
```

### ToBytesErrorType

```ts
export type ToBytesErrorType =
  | NumberToBytesErrorType
  | BoolToBytesErrorType
  | HexToBytesErrorType
  | StringToBytesErrorType
  | IsHexErrorType
  | ErrorType
```

### BoolToBytesOpts

```ts
export type BoolToBytesOpts = {
  /** Size of the output bytes. */
  size?: number | undefined
}
```

### BoolToBytesErrorType

```ts
export type BoolToBytesErrorType =
  | AssertSizeErrorType
  | PadErrorType
  | ErrorType
```

### HexToBytesOpts

```ts
export type HexToBytesOpts = {
  /** Size of the output bytes. */
  size?: number | undefined
}
```

### HexToBytesErrorType

```ts
export type HexToBytesErrorType = AssertSizeErrorType | PadErrorType | ErrorType
```

### NumberToBytesErrorType

```ts
export type NumberToBytesErrorType =
  | NumberToHexErrorType
  | HexToBytesErrorType
  | ErrorType
```

### StringToBytesOpts

```ts
export type StringToBytesOpts = {
  /** Size of the output bytes. */
  size?: number | undefined
}
```

### StringToBytesErrorType

```ts
export type StringToBytesErrorType =
  | AssertSizeErrorType
  | PadErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toBytes.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/encoding/toBytes.ts, lines 238–248.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
