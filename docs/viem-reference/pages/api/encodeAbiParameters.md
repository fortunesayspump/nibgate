# encodeAbiParameters

Generates ABI encoded data.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts#L86-L107) · [Official reference](https://viem.sh/docs/abi/encodeAbiParameters)

## Signature

```ts
export function encodeAbiParameters<
  const params extends readonly AbiParameter[] | readonly unknown[],
>(
  params: params,
  values: params extends readonly AbiParameter[]
    ? AbiParametersToPrimitiveTypes<params, AbiParameterKind, true>
    : never,
): EncodeAbiParametersReturnType;
```

## Parameters

- **params**: `params`
- **values**: `params extends readonly AbiParameter[] ? AbiParametersToPrimitiveTypes<params, AbiParameterKind, true> : never`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/encodeAbiParameters.md).

```ts
```typescript
import { encodeAbiParameters } from 'viem'

const encodedData = encodeAbiParameters(
  [
    { name: 'x', type: 'string' },
    { name: 'y', type: 'uint' },
    { name: 'z', type: 'bool' }
  ],
  ['wagmi', 420n, true]
)
```

You can also pass in Human Readable parameters with the parseAbiParameters utility.
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### EncodeAbiParametersReturnType

```ts
export type EncodeAbiParametersReturnType = Hex
```

### EncodeAbiParametersErrorType

```ts
export type EncodeAbiParametersErrorType =
  | AbiEncodingLengthMismatchErrorType
  | PrepareParamsErrorType
  | EncodeParamsErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/abi/encodeAbiParameters.ts, lines 86–107.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
