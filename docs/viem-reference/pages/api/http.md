# http

The `http` Transport connects to a JSON-RPC API via HTTP.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/http.ts#L100-L195) · [Official reference](https://viem.sh/docs/clients/transports/http)

## Signature

```ts
export function http<
  rpcSchema extends RpcSchema | undefined = undefined,
  raw extends boolean = false,
>(
  /** URL of the JSON-RPC API. Defaults to the chain's public RPC URL. */
  url?: string | undefined,
  config: HttpTransportConfig<rpcSchema, raw> = {},
): HttpTransport<rpcSchema, raw>;
```

## Parameters

- **url** (optional): `string | undefined`
- **config** (optional): `HttpTransportConfig<rpcSchema, raw>` Default expression: {}.

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/transports/http.md).

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://1.rpc.thirdweb.com/...'),
})
```

## Integration Notes

Use the RPC endpoint for the intended chain. The upstream example is retained as an example; it is not evidence that Nibgate uses the example network.

## Exported Types in This Source File

### HttpTransportConfig

```ts
export type HttpTransportConfig<
  rpcSchema extends RpcSchema | undefined = undefined,
  raw extends boolean = false,
> = {
  /**
   * Whether to enable Batch JSON-RPC.
   * @link https://www.jsonrpc.org/specification#batch
   */
  batch?:
    | boolean
    | {
        /** The maximum number of JSON-RPC requests to send in a batch. @default 1_000 */
        batchSize?: number | undefined
        /** The maximum number of milliseconds to wait before sending a batch. @default 0 */
        wait?: number | undefined
      }
    | undefined
  fetchFn?: HttpRpcClientOptions['fetchFn'] | undefined
  /**
   * Request configuration to pass to `fetch`.
   * @link https://developer.mozilla.org/en-US/docs/Web/API/fetch
   */
  fetchOptions?: HttpRpcClientOptions['fetchOptions'] | undefined
  /** Maximum response body size in bytes. Set to `false` to disable. @default 10_485_760 */
  maxResponseBodySize?: HttpRpcClientOptions['maxResponseBodySize'] | undefined
  /** A callback to handle the response from `fetch`. */
  onFetchRequest?: HttpRpcClientOptions['onRequest'] | undefined
  /** A callback to handle the response from `fetch`. */
  onFetchResponse?: HttpRpcClientOptions['onResponse'] | undefined
  /** The key of the HTTP transport. */
  key?: TransportConfig['key'] | undefined
  /** Methods to include or exclude from executing RPC requests. */
  methods?: TransportConfig['methods'] | undefined
  /** The name of the HTTP transport. */
  name?: TransportConfig['name'] | undefined
  /** Whether to return JSON RPC errors as responses instead of throwing. */
  raw?: raw | boolean | undefined
  /** The max number of times to retry. */
  retryCount?: TransportConfig['retryCount'] | undefined
  /** The base delay (in ms) between retries. */
  retryDelay?: TransportConfig['retryDelay'] | undefined
  /** Typed JSON-RPC schema for the transport. */
  rpcSchema?: rpcSchema | RpcSchema | undefined
  /** The timeout (in ms) for the HTTP request. Default: 10_000 */
  timeout?: TransportConfig['timeout'] | undefined
}
```

### HttpTransport

```ts
export type HttpTransport<
  rpcSchema extends RpcSchema | undefined = undefined,
  raw extends boolean = false,
> = Transport<
  'http',
  {
    fetchOptions?: HttpTransportConfig['fetchOptions'] | undefined
    url?: string | undefined
  },
  EIP1193RequestFn<rpcSchema, raw>
>
```

### HttpTransportErrorType

```ts
export type HttpTransportErrorType =
  | CreateTransportErrorType
  | UrlRequiredErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/http.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/clients/transports/http.ts, lines 100–195.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
