# createPublicClient

A Public Client is an interface to "public" [JSON-RPC API](https://ethereum.org/en/developers/docs/apis/json-rpc/) methods such as retrieving block numbers, transactions, reading from smart contracts, etc through [Public Actions](https://viem.sh/docs/actions/public/introduction).

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createPublicClient.ts#L80-L109) · [Official reference](https://viem.sh/docs/clients/public)

## Signature

```ts
export function createPublicClient<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
  const tokens extends Tokens | undefined = undefined,
>(
  parameters: PublicClientConfig<
    transport,
    chain,
    accountOrAddress,
    rpcSchema,
    tokens
  >,
): PublicClient<
  transport,
  chain,
  ParseAccount<accountOrAddress>,
  rpcSchema,
  tokens
>;
```

## Parameters

- **parameters**: `PublicClientConfig< transport, chain, accountOrAddress, rpcSchema, tokens >`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/public.md).

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(),
})
```

## Integration Notes

Client construction is local configuration. This reference’s tests do not make live RPC requests or claim a chain is available.

## Exported Types in This Source File

### PublicClientConfig

```ts
export type PublicClientConfig<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
  tokens extends Tokens | undefined = Tokens | undefined,
> = Prettify<
  Pick<
    ClientConfig<transport, chain, accountOrAddress, rpcSchema, tokens>,
    | 'batch'
    | 'cacheTime'
    | 'ccipRead'
    | 'chain'
    | 'experimental_blockTag'
    | 'key'
    | 'name'
    | 'pollingInterval'
    | 'rpcSchema'
    | 'tokens'
    | 'transport'
  >
>
```

### PublicClient

```ts
export type PublicClient<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  accountOrAddress extends Account | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
  tokens extends Tokens | undefined = Tokens | undefined,
> = Prettify<
  Client<
    transport,
    chain,
    accountOrAddress,
    rpcSchema extends RpcSchema
      ? [...PublicRpcSchema, ...rpcSchema]
      : PublicRpcSchema,
    PublicActions<transport, chain, accountOrAddress, tokens>,
    tokens
  >
>
```

### CreatePublicClientErrorType

```ts
export type CreatePublicClientErrorType = CreateClientErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createPublicClient.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/clients/createPublicClient.ts, lines 80–109.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
