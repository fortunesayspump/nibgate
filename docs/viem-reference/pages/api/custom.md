# custom

The `custom` Transport accepts an [EIP-1193 `request` function](https://eips.ethereum.org/EIPS/eip-1193#request-1) as a parameter. This transport is useful for integrating with injected wallets, wallets that provide an EIP-1193 provider (eg. WalletConnect or Coinbase SDK), or even providing your own custom `request` function.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/custom.ts#L35-L55) · [Official reference](https://viem.sh/docs/clients/transports/custom)

## Signature

```ts
export function custom<provider extends EthereumProvider>(
  provider: provider,
  config: CustomTransportConfig = {},
): CustomTransport;
```

## Parameters

- **provider**: `provider`
- **config** (optional): `CustomTransportConfig` Default expression: {}.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/transports/custom.md).

```ts
import 'viem/window'

import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'

const client = createWalletClient({
  chain: mainnet,
  transport: custom(window.ethereum!)
})
```

## Integration Notes

Use an actual authorized EIP-1193 provider in an application. No provider request or wallet permission prompt is executed by this documentation build.

## Exported Types in This Source File

### CustomTransportConfig

```ts
export type CustomTransportConfig = {
  /** The key of the transport. */
  key?: TransportConfig['key'] | undefined
  /** Methods to include or exclude from executing RPC requests. */
  methods?: TransportConfig['methods'] | undefined
  /** The name of the transport. */
  name?: TransportConfig['name'] | undefined
  /** The max number of times to retry. */
  retryCount?: TransportConfig['retryCount'] | undefined
  /** The base delay (in ms) between retries. */
  retryDelay?: TransportConfig['retryDelay'] | undefined
}
```

### CustomTransport

```ts
export type CustomTransport = Transport<
  'custom',
  {},
  EthereumProvider['request']
>
```

### CustomTransportErrorType

```ts
export type CustomTransportErrorType = CreateTransportErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/custom.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/clients/transports/custom.ts, lines 35–55.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
