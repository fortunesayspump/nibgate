# createWalletClient

A Wallet Client is an interface to interact with [Ethereum Account(s)](https://ethereum.org/en/glossary/#account) and provides the ability to retrieve accounts, execute transactions, sign messages, etc through [Wallet Actions](https://viem.sh/docs/actions/wallet/introduction).

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createWalletClient.ts#L124-L136) · [Official reference](https://viem.sh/docs/clients/wallet)

## Signature

```ts
export function createWalletClient<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  accountOrAddress extends Account | Address | undefined = undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
  const tokens extends Tokens | undefined = undefined,
>(
  parameters: WalletClientConfig<
    transport,
    chain,
    accountOrAddress,
    rpcSchema,
    tokens
  >,
): WalletClient<
  transport,
  chain,
  ParseAccount<accountOrAddress>,
  rpcSchema,
  tokens
>;
```


```ts
export function createWalletClient(
  parameters: WalletClientConfig,
): WalletClient;
```

## Parameters

- **parameters**: `WalletClientConfig`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/wallet.md).

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

Creating a wallet client is local configuration. None of this reference’s checks request accounts, sign a message or send a transaction.

## Exported Types in This Source File

### WalletClientConfig

```ts
export type WalletClientConfig<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  accountOrAddress extends Account | Address | undefined =
    | Account
    | Address
    | undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
  tokens extends Tokens | undefined = Tokens | undefined,
> = Prettify<
  Pick<
    ClientConfig<transport, chain, accountOrAddress, rpcSchema, tokens>,
    | 'account'
    | 'cacheTime'
    | 'ccipRead'
    | 'chain'
    | 'dataSuffix'
    | 'key'
    | 'name'
    | 'pollingInterval'
    | 'rpcSchema'
    | 'tokens'
    | 'transport'
  >
>
```

### WalletClient

```ts
export type WalletClient<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain | undefined,
  account extends Account | undefined = Account | undefined,
  rpcSchema extends RpcSchema | undefined = undefined,
  tokens extends Tokens | undefined = Tokens | undefined,
> = Prettify<
  Client<
    transport,
    chain,
    account,
    rpcSchema extends RpcSchema
      ? [...WalletRpcSchema, ...rpcSchema]
      : WalletRpcSchema,
    WalletActions<chain, account, tokens>,
    tokens
  >
>
```

### CreateWalletClientErrorType

```ts
export type CreateWalletClientErrorType = CreateClientErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createWalletClient.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/clients/createWalletClient.ts, lines 124–136.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
