# Viem Integration Reference

Source-linked reference for the Viem utilities and client configuration used around Nibgate’s payment and access flows. This is a focused companion to the [Nibgate integration guides](https://docs.nibgate.xyz/payments-receipts), not an official Viem documentation site.

## Scope

This reference documents **24 public APIs** from **Viem 2.54.1**, the version declared by Nibgate at the start of this work. Signatures, parameter types, local exported types and source links are extracted from [upstream commit e6e0c1bef949fbdc837662fbd41ebe739ccae030](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/index.ts). The library is maintained by wevm, independently of Nibgate, and is [MIT licensed](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/LICENSE).

Viem has a much wider API. Client methods, chain definitions, account abstraction and Tempo-specific modules are outside this deliberately scoped reference. Related utilities are included to make the encoding, amount formatting and verification paths understandable; inclusion does not claim that every function is directly imported by Nibgate.

## Find an API

### Clients and Transports

- [createPublicClient](/viem-reference/pages/api/createPublicClient.html)
- [createWalletClient](/viem-reference/pages/api/createWalletClient.html)
- [custom](/viem-reference/pages/api/custom.html)
- [fallback](/viem-reference/pages/api/fallback.html)
- [http](/viem-reference/pages/api/http.html)

### ABI Encoding

- [decodeAbiParameters](/viem-reference/pages/api/decodeAbiParameters.html)
- [decodeEventLog](/viem-reference/pages/api/decodeEventLog.html)
- [decodeFunctionData](/viem-reference/pages/api/decodeFunctionData.html)
- [encodeAbiParameters](/viem-reference/pages/api/encodeAbiParameters.html)
- [encodeFunctionData](/viem-reference/pages/api/encodeFunctionData.html)

### Addresses

- [getAddress](/viem-reference/pages/api/getAddress.html)
- [getContractAddress](/viem-reference/pages/api/getContractAddress.html)
- [isAddress](/viem-reference/pages/api/isAddress.html)
- [isAddressEqual](/viem-reference/pages/api/isAddressEqual.html)

### Encoding and Hashing

- [stringToBytes](/viem-reference/pages/api/stringToBytes.html)
- [toHex](/viem-reference/pages/api/toHex.html)
- [keccak256](/viem-reference/pages/api/keccak256.html)

### Signatures

- [hashMessage](/viem-reference/pages/api/hashMessage.html)
- [hashTypedData](/viem-reference/pages/api/hashTypedData.html)
- [recoverMessageAddress](/viem-reference/pages/api/recoverMessageAddress.html)

### Units

- [formatEther](/viem-reference/pages/api/formatEther.html)
- [formatUnits](/viem-reference/pages/api/formatUnits.html)
- [parseEther](/viem-reference/pages/api/parseEther.html)
- [parseUnits](/viem-reference/pages/api/parseUnits.html)

## How This Reference Was Produced

A TypeScript AST extractor reads the pinned source and joins the signatures with examples from the same upstream commit. Sourcey 3.9.0 builds the resulting Markdown into this searchable site. Source files and their hashes are preserved with the build configuration. See [integration context](/viem-reference/pages/integration.html) and [verification boundaries](/viem-reference/pages/verification.html).

## Attribution

Viem source and upstream examples are MIT licensed, copyright weth LLC. The full license is retained in the reference source package. Nibgate’s hosting and integration notes do not imply endorsement by wevm or Circle.
