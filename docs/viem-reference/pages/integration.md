# Integration Context

This reference lives alongside Nibgate’s payment and access documentation because Viem is a real dependency in those paths. It is not a renamed copy of Nibgate’s own API reference.

## Where Viem Is Used

The following links pin Nibgate’s source at commit c822221af30c07ca93864b89fdc693c6b2c98c37, before this reference was added.

- [Browser EVM payment flow](https://github.com/fortunesayspump/nibgate/blob/c822221af30c07ca93864b89fdc693c6b2c98c37/packages/nibgate/src/browser/evm-gateway.js): client and transport construction around the wallet-backed payment path.
- [Fee-wallet settlement path](https://github.com/fortunesayspump/nibgate/blob/c822221af30c07ca93864b89fdc693c6b2c98c37/packages/nibgate/src/server/fee-wallet.js): address normalization, ABI encoding and transaction receipt checks.
- [Existing payments guide](https://docs.nibgate.xyz/payments-receipts): Viem encoding alongside the separate Circle Gateway integration.

Nibgate’s direct use of a helper does not mean this reference has verified every application path. The checks here exercise deterministic utility behavior and type-check example calls. They do not sign, broadcast, deposit, withdraw or spend funds.

## Reading Payment Amounts

Use [parseUnits](/viem-reference/pages/api/parseUnits.html) and [formatUnits](/viem-reference/pages/api/formatUnits.html) with the token’s verified decimal count. [parseEther](/viem-reference/pages/api/parseEther.html) assumes 18 decimals and should not be substituted for a six-decimal token parser.

Viem 2.54.1 rounds fractional digits beyond the selected precision. For a payment form, validate user input before conversion when rounding would change what the user intended. The local validation records the actual result of parsing `1.0000009` at six decimals as `1000001n`.

## Encoding Is Not Settlement

[encodeFunctionData](/viem-reference/pages/api/encodeFunctionData.html) produces calldata. [decodeFunctionData](/viem-reference/pages/api/decodeFunctionData.html) describes calldata. Neither confirms execution. A receipt consumer still needs the expected chain, contract, successful status, recipient and amount. A decoded log alone does not establish the emitting contract.

## Signatures Need Application Context

[recoverMessageAddress](/viem-reference/pages/api/recoverMessageAddress.html) recovers an address for the exact supplied message. Expiry, audience, resource identifiers and replay protection remain the application’s responsibility. Keep text and raw-byte message formats consistent between signing and recovery.

## Version Boundary

This build pins Viem 2.54.1 to match Nibgate’s declared dependency. It does not claim to represent the latest Viem release. Recent upstream maintenance was checked separately at commit [17c2c520e8ffb4fa09473422fdf84a1b8ff1469d](https://github.com/wevm/viem/commit/17c2c520e8ffb4fa09473422fdf84a1b8ff1469d), dated November 8, 2026. Updating this reference requires choosing a new source commit, regenerating the pages and repeating the checks.

## Related Documentation

- [Nibgate payments and receipts](https://docs.nibgate.xyz/payments-receipts)
- [Viem official documentation](https://viem.sh)
- [Reference scope](/viem-reference/)
