# parseEther

Converts a string representation of ether to numerical wei.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseEther.ts#L19-L21) · [Official reference](https://viem.sh/docs/utilities/parseEther)

## Signature

```ts
export function parseEther(ether: string, unit: 'wei' | 'gwei' = 'wei');
```

## Parameters

- **ether**: `string`
- **unit** (optional): `'wei' | 'gwei'` Default expression: 'wei'.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/parseEther.md).

```ts
import { parseEther } from 'viem'

parseEther('420')
// 420000000000000000000n
```

## Integration Notes

This helper assumes 18 decimals. It is not the correct parser for a six-decimal USDC amount; use parseUnits with the token’s verified decimals.

## Exported Types in This Source File

### ParseEtherErrorType

```ts
export type ParseEtherErrorType = ParseUnitsErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseEther.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/unit/parseEther.ts, lines 19–21.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
