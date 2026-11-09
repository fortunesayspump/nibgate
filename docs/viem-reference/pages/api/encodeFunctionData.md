# encodeFunctionData

Encodes the function name and parameters into an ABI encoded value (4 byte selector & arguments).

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeFunctionData.ts#L70-L95) · [Official reference](https://viem.sh/docs/contract/encodeFunctionData)

## Signature

```ts
export function encodeFunctionData<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi> | undefined = undefined,
>(
  parameters: EncodeFunctionDataParameters<abi, functionName>,
): EncodeFunctionDataReturnType;
```

## Parameters

- **parameters**: `EncodeFunctionDataParameters<abi, functionName>`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/contract/encodeFunctionData.md).

```ts
import { encodeFunctionData } from 'viem'
import { wagmiAbi } from './abi.ts'

const data = encodeFunctionData({
  abi: wagmiAbi,
  functionName: 'totalSupply'
})
```

## Integration Notes

Encoding creates calldata only. It does not send a transaction, authorize a payment or prove settlement. Nibgate uses this family of helpers when constructing its direct-transfer path.

## Exported Types in This Source File

### EncodeFunctionDataParameters

```ts
export type EncodeFunctionDataParameters<
  abi extends Abi | readonly unknown[] = Abi,
  functionName extends
    | ContractFunctionName<abi>
    | Hex
    | undefined = ContractFunctionName<abi>,
  ///
  hasFunctions = abi extends Abi
    ? Abi extends abi
      ? true
      : [ExtractAbiFunctions<abi>] extends [never]
        ? false
        : true
    : true,
  allArgs = ContractFunctionArgs<
    abi,
    AbiStateMutability,
    functionName extends ContractFunctionName<abi>
      ? functionName
      : ContractFunctionName<abi>
  >,
  allFunctionNames = ContractFunctionName<abi>,
> = {
  abi: abi
} & UnionEvaluate<
  IsNarrowable<abi, Abi> extends true
    ? abi['length'] extends 1
      ? { functionName?: functionName | allFunctionNames | Hex | undefined }
      : { functionName: functionName | allFunctionNames | Hex }
    : { functionName?: functionName | allFunctionNames | Hex | undefined }
> &
  UnionEvaluate<
    readonly [] extends allArgs
      ? { args?: allArgs | undefined }
      : { args: allArgs }
  > &
  (hasFunctions extends true ? unknown : never)
```

### EncodeFunctionDataReturnType

```ts
export type EncodeFunctionDataReturnType = Hex
```

### EncodeFunctionDataErrorType

```ts
export type EncodeFunctionDataErrorType =
  | AbiFunctionNotFoundErrorType
  | ConcatHexErrorType
  | EncodeAbiParametersErrorType
  | FormatAbiItemErrorType
  | GetAbiItemErrorType
  | ToFunctionSelectorErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeFunctionData.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/abi/encodeFunctionData.ts, lines 70–95.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
