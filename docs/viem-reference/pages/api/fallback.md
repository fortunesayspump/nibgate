# fallback

The `fallback` Transport consumes **multiple** Transports. If a Transport request fails, it will fall back to the next one in the list.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/fallback.ts#L107-L208) · [Official reference](https://viem.sh/docs/clients/transports/fallback)

## Signature

```ts
export function fallback<const transports extends readonly Transport[]>(
  transports_: transports,
  config: FallbackTransportConfig = {},
): FallbackTransport<transports>;
```

## Parameters

- **transports_**: `transports`
- **config** (optional): `FallbackTransportConfig` Default expression: {}.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/transports/fallback.md).

```ts
import { createPublicClient, fallback, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://1.rpc.thirdweb.com/...'),
    http('https://mainnet.infura.io/v3/...')
  ]),
})
```

## Integration Notes

Transport failover helps with provider failures. It does not make an unsupported network, mismatched chain or reverted transaction successful.

## Exported Types in This Source File

### OnResponseFn

```ts
export type OnResponseFn = (
  args: {
    method: string
    params: unknown[]
    transport: ReturnType<Transport>
  } & (
    | {
        error?: undefined
        response: unknown
        status: 'success'
      }
    | {
        error: Error
        response?: undefined
        status: 'error'
      }
  ),
) => void
```

### FallbackTransportConfig

```ts
export type FallbackTransportConfig = {
  /** The key of the Fallback transport. */
  key?: TransportConfig['key'] | undefined
  /** The name of the Fallback transport. */
  name?: TransportConfig['name'] | undefined
  /** Toggle to enable ranking, or rank options. */
  rank?: boolean | RankOptions | undefined
  /** The max number of times to retry. */
  retryCount?: TransportConfig['retryCount'] | undefined
  /** The base delay (in ms) between retries. */
  retryDelay?: TransportConfig['retryDelay'] | undefined
  /** Callback on whether an error should throw or try the next transport in the fallback. */
  shouldThrow?: (error: Error) => boolean | undefined
}
```

### FallbackTransport

```ts
export type FallbackTransport<
  transports extends readonly Transport[] = readonly Transport[],
> = Transport<
  'fallback',
  {
    onResponse: (fn: OnResponseFn) => void
    transports: {
      [key in keyof transports]: ReturnType<transports[key]>
    }
  }
>
```

### FallbackTransportErrorType

```ts
export type FallbackTransportErrorType = CreateTransportErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/fallback.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/clients/transports/fallback.ts, lines 107–208.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
