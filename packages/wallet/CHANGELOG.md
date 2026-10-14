# Changelog

## 0.4.25

Stable release for Arc mainnet and testnet; companion SDK is `0.4.35`.


### 0.4.25: verified unlock feedback

- Briefly show an accessible confirmation after verified unlocks and interrupted-payment recovery, then smoothly reveal the content. Defer the component's host callback until the confirmation finishes.
- Skip the success interlude for restored access; respect reduced motion and cancel delayed callbacks after navigation, disconnect, wallet/provider changes, or clearing access.
- Require a successful HTTP response with explicit verified access when restoring content; recheck provider hydration without replaying the success animation.

### 0.4.25: Direct component default

- Start shared React unlock controls on Direct when no rail was supplied; preserve explicit Gateway and the user’s current choice. Tips already use Direct. Server and Gateway-specific defaults are unchanged.

### 0.4.25: browser/CDN Gateway parity

- Export the shared transaction state machine for the SDK's non-React deposit UI, retaining the same account/chain, receipt, and saved-hash guards.
- Allow health/switch/repair helpers to target either trusted Arc network explicitly, independent of build defaults; caller-provided RPC values cannot override official repair metadata.
- The matching SDK source adds explicit provider selection, exact-network Gateway signing, same-tab retained authorization proofs, and separate verification/repair actions. Matching new package versions and clean consumer validation are required before publication.

### 0.4.25: selected-wallet RPC health and repair

- Support explicit trusted Arc mainnet/testnet targets for standalone/CDN health and repair calls, independent of the build default. Reject non-Arc targets and ignore caller-supplied RPC metadata.
- Ignore retained connection-notice callbacks from an older provider/account and invalidate in-flight repair UI through unmount/effect replay.

- Check the selected wallet's real chain and block reads even when cached chain metadata matches. Tip/unlock checks and per-send Gateway checks stop before payment when the wallet connection fails.
- Add passive connection notices without automatically changing healthy wallet settings. Explicit repair suggests the official Arc RPC, respects wallet rejection, rechecks actual reads, and offers manual settings if necessary; it never claims a saved URL was forcibly replaced.
- Separate wallet HTTP 404, unsupported methods, authorization, cancellation, rate limiting, access denial, and timeout errors; omit raw provider payloads. Keep Hub/API errors separate.
- Export `checkArcConnection`, `repairArcNetwork`, `ArcConnectionError`, and wallet-bound `classifyArcRpcError`, with TypeScript declarations and offline regression coverage. Shared Gateway/Direct payment selection is unchanged.

### 0.4.25: Gateway provider and confirmation guards

- Both browser Gateway UIs use the connected AppKit EVM provider, with account and active-chain checks before every send. Switch rejection, account/provider changes, disconnects, and closing the modal stop any subsequent transaction request.
- Confirm the exact approval transaction before requesting a deposit; require a successful, matching deposit/withdrawal receipt before reporting success.
- Retain approval and transfer hashes in same-tab session storage across modal remounts/reloads. Resume checks the saved transaction, preserving its amount and avoiding another broadcast. Ambiguous sends without a saved hash fail closed for manual wallet-activity review.
- Check selected-wallet RPC health before each Gateway transaction request. Add explicit repair buttons that request the official RPC, verify liveness, preserve pending hashes, and never automatically resend.
- Export the shared `useGatewayTransfer(address)` hook. A new transfer requires an explicit reset after the prior terminal receipt has been checked.
- Included in stable wallet `0.4.25`; funded live-wallet validation remains separate from the automated fixture tests.

## 0.4.25-testnet.0 (release candidate)

- Retain submitted tip proofs in component memory; `tip()` and `retryVerification()` verify the same proof without sending another payment. Reload/remount recovery is not durable.
- Distinguish pending verification, permanently blocked proof conflicts, verified receipts and post-success UI failures.
- Target the npm `testnet` tag; companion SDK is `0.4.35-testnet.0`.
- Require the matching testnet Hub retry-safety changes before validating repeated tip verification.
- Publication and funded end-to-end validation are separate release gates.

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
