# decodeAbiParameters

Decodes ABI encoded data using the [ABI specification](https://solidity.readthedocs.io/en/latest/abi-spec), given a set of ABI parameters (`inputs`/`outputs`) and the encoded ABI data.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeAbiParameters.ts#L56-L86) · [Official reference](https://viem.sh/docs/abi/decodeAbiParameters)

## Signature

```ts
export function decodeAbiParameters<
  const params extends readonly AbiParameter[],
>(
  params: params,
  data: ByteArray | Hex,
): DecodeAbiParametersReturnType<params>;
```

## Parameters

- **params**: `params`
- **data**: `ByteArray | Hex`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/decodeAbiParameters.md).

```ts
import { decodeAbiParameters } from 'viem'

const values = decodeAbiParameters(
  [
    { name: 'x', type: 'string' },
    { name: 'y', type: 'uint' },
    { name: 'z', type: 'bool' }
  ],
  '0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001a4000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000057761676d69000000000000000000000000000000000000000000000000000000',
)
// ['wagmi', 420n, true]
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### DecodeAbiParametersReturnType

```ts
export type DecodeAbiParametersReturnType<
  params extends readonly AbiParameter[] = readonly AbiParameter[],
> = AbiParametersToPrimitiveTypes<
  params extends readonly AbiParameter[] ? params : AbiParameter[],
  AbiParameterKind,
  true
>
```

### DecodeAbiParametersErrorType

```ts
export type DecodeAbiParametersErrorType =
  | HexToBytesErrorType
  | BytesToHexErrorType
  | DecodeParameterErrorType
  | SizeErrorType
  | CreateCursorErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeAbiParameters.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/abi/decodeAbiParameters.ts, lines 56–86.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
