# decodeEventLog

Decodes ABI encoded event topics & data.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeEventLog.ts#L98-L220) · [Official reference](https://viem.sh/docs/contract/decodeEventLog)

## Signature

```ts
export function decodeEventLog<
  const abi extends Abi | readonly unknown[],
  eventName extends ContractEventName<abi> | undefined = undefined,
  topics extends Hex[] = Hex[],
  data extends Hex | undefined = undefined,
  strict extends boolean = true,
>(
  parameters: DecodeEventLogParameters<abi, eventName, topics, data, strict>,
): DecodeEventLogReturnType<abi, eventName, topics, data, strict>;
```

## Parameters

- **parameters**: `DecodeEventLogParameters<abi, eventName, topics, data, strict>`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/contract/decodeEventLog.md).

```ts
import { decodeEventLog } from 'viem'
import { wagmiAbi } from './abi.ts'

const topics = decodeEventLog({
  abi: wagmiAbi,
  data: '0x0000000000000000000000000000000000000000000000000000000000000001',
  topics: [
    '0x406dade31f7ae4b5dbc276258c28dde5ae6d5c2773c5745802c493a2360e55e0',
    '0x00000000000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    '0x0000000000000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8'
  ]
})
/**
 *  {
 *    eventName: 'Transfer',
 *    args: {
 *      from: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
 *      to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
 *      value: 1n
 *    }
 *  }
 */
```

## Integration Notes

Decoding an event does not establish which contract emitted it. Match the receipt’s contract address and expected chain before accepting a payment.

## Exported Types in This Source File

### DecodeEventLogParameters

```ts
export type DecodeEventLogParameters<
  abi extends Abi | readonly unknown[] = Abi,
  eventName extends ContractEventName<abi> | undefined = ContractEventName<abi>,
  topics extends Hex[] = Hex[],
  data extends Hex | undefined = undefined,
  strict extends boolean = true,
> = {
  abi: abi
  data?: data | undefined
  eventName?: eventName | ContractEventName<abi> | undefined
  strict?: strict | boolean | undefined
  topics: [signature: Hex, ...args: topics] | []
}
```

### DecodeEventLogReturnType

```ts
export type DecodeEventLogReturnType<
  abi extends Abi | readonly unknown[] = Abi,
  eventName extends ContractEventName<abi> | undefined = ContractEventName<abi>,
  topics extends Hex[] = Hex[],
  data extends Hex | undefined = undefined,
  strict extends boolean = true,
  ///
  allEventNames extends
    ContractEventName<abi> = eventName extends ContractEventName<abi>
    ? eventName
    : ContractEventName<abi>,
> = IsNarrowable<abi, Abi> extends true
  ? {
      [name in allEventNames]: Prettify<
        {
          eventName: name
        } & UnionEvaluate<
          ContractEventArgsFromTopics<abi, name, strict> extends infer allArgs
            ? topics extends readonly []
              ? data extends undefined
                ? { args?: undefined }
                : { args?: allArgs | undefined }
              : { args: allArgs }
            : never
        >
      >
    }[allEventNames]
  : {
      eventName: eventName
      args: readonly unknown[] | undefined
    }
```

### DecodeEventLogErrorType

```ts
export type DecodeEventLogErrorType =
  | AbiDecodingDataSizeTooSmallErrorType
  | AbiEventSignatureEmptyTopicsErrorType
  | AbiEventSignatureNotFoundErrorType
  | DecodeAbiParametersErrorType
  | DecodeLogTopicsMismatchErrorType
  | DecodeLogDataMismatchErrorType
  | FormatAbiItemErrorType
  | ToEventSelectorErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeEventLog.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/abi/decodeEventLog.ts, lines 98–220.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
