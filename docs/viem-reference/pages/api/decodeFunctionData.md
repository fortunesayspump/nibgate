# decodeFunctionData

Decodes ABI encoded data (4 byte selector & arguments) into a function name and arguments.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeFunctionData.ts#L56-L78) · [Official reference](https://viem.sh/docs/contract/decodeFunctionData)

## Signature

```ts
export function decodeFunctionData<const abi extends Abi | readonly unknown[]>(
  parameters: DecodeFunctionDataParameters<abi>,
);
```

## Parameters

- **parameters**: `DecodeFunctionDataParameters<abi>`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/contract/decodeFunctionData.md).

```ts
import { decodeFunctionData } from 'viem'
import { wagmiAbi } from './abi.ts'

const { functionName } = decodeFunctionData({
  abi: wagmiAbi,
  data: '0x18160ddd'
})
// { functionName: 'totalSupply' }
```

## Integration Notes

Decoded calldata describes a proposed call, not proof that it executed. Check the network, destination contract and successful receipt separately.

## Exported Types in This Source File

### DecodeFunctionDataParameters

```ts
export type DecodeFunctionDataParameters<
  abi extends Abi | readonly unknown[] = Abi,
> = {
  abi: abi
  data: Hex
}
```

### DecodeFunctionDataReturnType

```ts
export type DecodeFunctionDataReturnType<
  abi extends Abi | readonly unknown[] = Abi,
  ///
  allFunctionNames extends
    ContractFunctionName<abi> = ContractFunctionName<abi>,
> = IsNarrowable<abi, Abi> extends true
  ? UnionEvaluate<
      {
        [functionName in allFunctionNames]: {
          args: ContractFunctionArgs<abi, AbiStateMutability, functionName>
          functionName: functionName
        }
      }[allFunctionNames]
    >
  : {
      args: readonly unknown[] | undefined
      functionName: string
    }
```

### DecodeFunctionDataErrorType

```ts
export type DecodeFunctionDataErrorType =
  | AbiFunctionSignatureNotFoundError
  | DecodeAbiParametersErrorType
  | FormatAbiItemErrorType
  | ToFunctionSelectorErrorType
  | SliceErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeFunctionData.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/abi/decodeFunctionData.ts, lines 56–78.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
