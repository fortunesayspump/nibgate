# hashMessage

Hashes a message in EIP-191 format.

Viem 2.54.1. [Source at the pinned commit](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/hashMessage.ts#L14-L19) · [Official reference](https://viem.sh/docs/utilities/hashMessage)

## Signature

```ts
export function hashMessage<to extends To = 'hex'>(
  message: SignableMessage,
  to_?: to | undefined,
): HashMessageReturnType<to>;
```

## Parameters

- **message**: `SignableMessage`
- **to_** (optional): `to | undefined`

## Example from Upstream

The following is an upstream documentation example, not a live payment result. Any referenced wallet, chain or local module belongs to the original example’s context. [Pinned example source](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/hashMessage.md).

```ts
import { hashMessage } from 'viem'

hashMessage('hello world')
// 0xd9eba16ed0ecae432b71fe008c98cc872bb4cc214d3220a36f365326cf807d68

// Hash a hex data value.
hashMessage({ raw: '0x68656c6c6f20776f726c64' })
// 0xd9eba16ed0ecae432b71fe008c98cc872bb4cc214d3220a36f365326cf807d68

// Hash a bytes data value.
hashMessage({
  raw: Uint8Array.from([
    104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100,
  ])})
// 0xd9eba16ed0ecae432b71fe008c98cc872bb4cc214d3220a36f365326cf807d68
```

## Integration Notes

A text message and a raw-byte message are different inputs. Keep the encoding identical between the signer and verifier.

## Exported Types in This Source File

### HashMessageReturnType

```ts
export type HashMessageReturnType<to extends To> =
  | (to extends 'bytes' ? ByteArray : never)
  | (to extends 'hex' ? Hex : never)
```

### HashMessageErrorType

```ts
export type HashMessageErrorType = Keccak256ErrorType | ErrorType
```


Imported type definitions remain in the [pinned source file](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/hashMessage.ts); this focused reference does not expand the entire type graph.

## Provenance

- Repository: [wevm/viem](https://github.com/wevm/viem).
- Commit: e6e0c1bef949fbdc837662fbd41ebe739ccae030.
- Source: src/utils/signature/hashMessage.ts, lines 14–19.
- License: [MIT](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE), copyright weth LLC.
- Generated from the TypeScript AST and the linked upstream Markdown with Sourcey 3.9.0.
- Maintained independently as part of Nibgate’s integration docs. This is not an official Viem site.
