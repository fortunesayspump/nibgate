# parseUnits

Multiplies a string representation of a number by a given exponent of base 10.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseUnits.ts#L17-L57) · [Official reference](https://viem.sh/docs/utilities/parseUnits)

## Signature

```ts
export function parseUnits(value: string, decimals: number);
```

## Parameters

- **value**: `string`
- **decimals**: `number`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/parseUnits.md).

```ts
import { parseUnits } from 'viem'

parseUnits('420', 9)
// 420000000000n
```

## Integration Notes

Payment amounts must be checked against the token’s decimal limit before parsing. This version rounds excess fractional digits. The local test records this behavior; it does not treat rounded amounts as a successful payment.

## Exported Types in This Source File

### ParseUnitsErrorType

```ts
export type ParseUnitsErrorType = ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseUnits.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/unit/parseUnits.ts, lines 17–57.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
