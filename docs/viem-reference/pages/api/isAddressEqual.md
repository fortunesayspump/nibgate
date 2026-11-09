# isAddressEqual

Checks if the given addresses (checksummed) are equal.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/isAddressEqual.ts#L13-L19) · [Official reference](https://viem.sh/docs/utilities/isAddressEqual)

## Signature

```ts
export function isAddressEqual(a: Address, b: Address);
```

## Parameters

- **a**: `Address`
- **b**: `Address`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/isAddressEqual.md).

```ts
import { isAddressEqual } from 'viem'

isAddressEqual('0xa5cc3c03994db5b0d9a5eEdD10Cabab0813678ac', '0xa5cc3c03994DB5b0d9A5eEdD10CabaB0813678AC')
// true
```

## Integration Notes

This API is documented at the pinned Viem version. Use the source and official reference for its full contract; the examples below are illustrative code, not live account activity.

## Exported Types in This Source File

### IsAddressEqualReturnType

```ts
export type IsAddressEqualReturnType = boolean
```

### IsAddressEqualErrorType

```ts
export type IsAddressEqualErrorType = InvalidAddressErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/isAddressEqual.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/address/isAddressEqual.ts, lines 13–19.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
