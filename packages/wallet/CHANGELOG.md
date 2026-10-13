# Changelog

## 0.4.24

- Use the configured public Arc RPC in wallet network metadata on both mainnet and testnet, so embedded-wallet broadcasts are not routed through Nibgate's read-only application proxy.
- Keep application-owned reads on explicit `appRpcUrlFor()` transports; the companion Hub change preserves the same read-only proxy behavior for wallet balance reads.
- Add regression coverage for both network definitions, installed Reown RPC forwarding, environment overrides, and the application's unchanged read-only RPC allowlist.

These checks exercise the installed provider routing with a mocked iframe boundary. They do not perform a live wallet login, signature, or funded transaction.

## 0.4.23

- Reconcile the selected wallet account and provider before sign-in.
- Reject missing account authorization and invalidate sign-in when the account, provider, or connection changes.
- Stop abandoned sign-in attempts from creating a session, and handle wallet-picker dismissal and retries.
- Add the optional `assertActive` callback to `signInWithSiwe` and its TypeScript declaration.
- Correct tip error reporting: show the insufficient-USDC explanation only for the checked balance condition, preserve known wallet guidance, and avoid exposing arbitrary provider details.
- When a wallet has returned a valid transaction hash but the page encounters a later error, display the hash and advise checking the transaction before sending another tip. This does not confirm mining or payment success.

Source: reviewed sign-in commit `9be086523a9417476bb3ea997e4bfd78144ee5fb` and diagnostic commit `efa37d20d1e3191c03348882967fcc72c61851eb`. The related Hub navigation and error-display improvements are application changes.

Validation: 31 controlled sign-in regression tests and 21 mock-driven tip diagnostic tests. The reported live tip failure's underlying cause remains unverified; real browser-wallet interoperability, successful live payments, and a full application build are not established by these tests.
