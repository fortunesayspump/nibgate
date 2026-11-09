# formatUnits

Divides a number by a given exponent of base 10, and formats it into a string representation of the number.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/formatUnits.ts#L16-L32) · [Official reference](https://viem.sh/docs/utilities/formatUnits)

## Signature

```ts
export function formatUnits(value: bigint, decimals: number);
```

## Parameters

- **value**: `bigint`
- **decimals**: `number`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/formatUnits.md).

```ts
import { formatUnits } from 'viem'

formatUnits(420000000000n, 9)
// '420'
```

## Integration Notes

Use the token’s actual decimals. A formatted string is a representation of an amount, not a verified balance or settlement receipt.

## Exported Types in This Source File

### FormatUnitsErrorType

```ts
export type FormatUnitsErrorType = ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/formatUnits.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/unit/formatUnits.ts, lines 16–32.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
