# formatEther

Converts numerical wei to a string representation of ether.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/formatEther.ts#L18-L20) · [Official reference](https://viem.sh/docs/utilities/formatEther)

## Signature

```ts
export function formatEther(wei: bigint, unit: 'wei' | 'gwei' = 'wei');
```

## Parameters

- **wei**: `bigint`
- **unit** (optional): `'wei' | 'gwei'` Default expression: 'wei'.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/formatEther.md).

```ts
import { formatEther } from 'viem'

formatEther(1000000000000000000n)
// '1'
```

## Integration Notes

This helper uses 18 decimals. Use formatUnits with verified token decimals when presenting USDC.

## Exported Types in This Source File

### FormatEtherErrorType

```ts
export type FormatEtherErrorType = FormatUnitsErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/formatEther.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/unit/formatEther.ts, lines 18–20.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
