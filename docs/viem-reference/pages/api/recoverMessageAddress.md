# recoverMessageAddress

Recovers the signing address from a message & signature.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/recoverMessageAddress.ts#L27-L32) · [Official reference](https://viem.sh/docs/utilities/recoverMessageAddress)

## Signature

```ts
export async function recoverMessageAddress({
  message,
  signature,
}: RecoverMessageAddressParameters): Promise<RecoverMessageAddressReturnType>;
```

## Parameters

- **{
  message,
  signature,
}**: `RecoverMessageAddressParameters`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/recoverMessageAddress.md).

```ts
import { recoverMessageAddress } from 'viem';
import { account, walletClient } from './config'

const signature = await walletClient.signMessage({
  account,
  message: 'hello world',
})

const address = await recoverMessageAddress({
  message: 'hello world',
  signature,
})
```

## Integration Notes

Message recovery proves the signer of the exact supplied message. It does not establish expiry, resource scope, replay protection or payment completion.

## Exported Types in This Source File

### RecoverMessageAddressParameters

```ts
export type RecoverMessageAddressParameters = {
  message: SignableMessage
  signature: Hex | ByteArray | Signature
}
```

### RecoverMessageAddressReturnType

```ts
export type RecoverMessageAddressReturnType = Address
```

### RecoverMessageAddressErrorType

```ts
export type RecoverMessageAddressErrorType =
  | HashMessageErrorType
  | RecoverAddressErrorType
  | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/recoverMessageAddress.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/signature/recoverMessageAddress.ts, lines 27–32.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
