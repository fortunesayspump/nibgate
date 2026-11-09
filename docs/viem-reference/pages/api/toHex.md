# toHex

Encodes a string, number, boolean or byte array to a hex value.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toHex.ts#L52-L63) · [Official reference](https://viem.sh/docs/utilities/toHex)

## Signature

```ts
export function toHex(
  value: string | number | bigint | boolean | ByteArray,
  opts: ToHexParameters = {},
): Hex;
```

## Parameters

- **value**: `string | number | bigint | boolean | ByteArray`
- **opts** (optional): `ToHexParameters` Default expression: {}.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/toHex.md).

```ts
import { toHex } from 'viem'
const data = toHex('Hello world')
// '0x48656c6c6f20776f726c6421'
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### ToHexParameters

```ts
export type ToHexParameters = {
  /** The size (in bytes) of the output hex value. */
  size?: number | undefined
}
```

### ToHexErrorType

```ts
export type ToHexErrorType =
  | BoolToHexErrorType
  | BytesToHexErrorType
  | NumberToHexErrorType
  | StringToHexErrorType
  | ErrorType
```

### BoolToHexOpts

```ts
export type BoolToHexOpts = {
  /** The size (in bytes) of the output hex value. */
  size?: number | undefined
}
```

### BoolToHexErrorType

```ts
export type BoolToHexErrorType = AssertSizeErrorType | PadErrorType | ErrorType
```

### BytesToHexOpts

```ts
export type BytesToHexOpts = {
  /** The size (in bytes) of the output hex value. */
  size?: number | undefined
}
```

### BytesToHexErrorType

```ts
export type BytesToHexErrorType = AssertSizeErrorType | PadErrorType | ErrorType
```

### NumberToHexOpts

```ts
export type NumberToHexOpts =
  | {
      /** Whether or not the number of a signed representation. */
      signed?: boolean | undefined
      /** The size (in bytes) of the output hex value. */
      size: number
    }
  | {
      signed?: undefined
      /** The size (in bytes) of the output hex value. */
      size?: number | undefined
    }
```

### NumberToHexErrorType

```ts
export type NumberToHexErrorType =
  | IntegerOutOfRangeErrorType
  | PadErrorType
  | ErrorType
```

### StringToHexOpts

```ts
export type StringToHexOpts = {
  /** The size (in bytes) of the output hex value. */
  size?: number | undefined
}
```

### StringToHexErrorType

```ts
export type StringToHexErrorType = BytesToHexErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toHex.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/encoding/toHex.ts, lines 52–63.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
