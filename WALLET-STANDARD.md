# Nibgate Wallet Standard

Status: **decision** — research-backed and resolved (see §5). §4 steps 1–6 implemented
(`packages/wallet`, SIWE auth, WalletConnect connector, hub/nibshare frontend migration,
pay/unlock + subblog gateway + SDK embed on the wallet standard, relay/gateway-balance
consolidation). Derived
from the current code (file:line references below) and from industry-standard practice
(wagmi v2, Reown AppKit, SIWE/EIP-4361 via `viem/siwe`, EIP-3326, WalletConnect) plus
documented vendor bug reports (MetaMask-mobile #6701, wevm/viem #472, reown-com/appkit
#2978/#3340/#3447/#4714/#5099).

Goal: **one** wallet connect → session sign-in → chain-guard → pay/unlock experience used
identically on every surface: hub, nibshare, unlock/paywall UI, and subblogs.

---

## 1. Problem

User-facing failures reported today:

- `The requested method and/or account has not been authorized by the user`
  (viem `UnauthorizedProviderError`, code 4100). Two documented root causes, both hit us:
  (1) the dapp requests a signature while the wallet's active chain differs from the dapp's
  chain — mobile wallets silently swallow the request and reject with exactly this error
  (MetaMask-mobile #6701); (2) the wallet doesn't implement `wallet_requestPermissions`,
  which wagmi/viem calls on connect — in-app browsers like Mises behave like Phantom did
  (wevm/viem #472), surfacing this same error verbatim.
- "No signing prompt comes out." Cause: (a) the chain-mismatch bug above, and (b) our
  sign-in message is a custom `"Welcome to Nibgate! ... Nonce: <n>"` string. Wallets only
  render a trusted, verified sign-in screen for **SIWE (EIP-4361)** messages that carry
  `domain`, `uri`, `chainId`, `nonce`, `expiration`. Some in-app wallets (e.g. Mises) will
  not surface a sign prompt for non-standard messages.
- Paying for your own content surfaces raw Circle Gateway `self_transfer` errors instead of
  being detected up front (payer == creator → no payment needed).
- Wrong network surfaces long raw error strings instead of a "Switch to Arc Testnet" prompt.
- No consistent error mapping: raw viem / Circle / provider strings reach users everywhere.

Structural cause: we do not have one wallet layer — we have three, and they diverge:

| Surface | Stack | Location |
|---|---|---|
| Hub header / sign-in / nibshare / dashboard | wagmi + AppKit | `frontend/src/lib/wagmi.ts`, `useNibgateConnect.ts`, `WalletButton.tsx`, `SigninFlow.tsx` |
| SDK embed widget | hand-rolled `window.ethereum` EIP-1193 | `packages/nibgate/src/browser/evm-gateway.js`, `reputation.js`, `default-ui.js`, `access.js`, `frontend/public/widget.js` |
| Subblog admin gateway | self-rolled JSON-RPC + typed-data | `subblogs/frontend/src/components/GatewayWallet.tsx` |

Other divergence:

- Duplicated message builders: `packages/internal/src/auth.js` vs `packages/cli/src/core/auth.js`.
- Two chain definitions with different RPC URLs: `rpc.testnet.arc.io` (SDK) vs `arc-testnet.drpc.org` (subblogs reads — now fixed, single `packages/wallet` def).
- Three deposit/withdraw implementations: SDK `default-ui.js`, subblogs `GatewayWallet.tsx`, hub `WalletButton.tsx`.
- Three x402 relays: `/api/hub/pay` (`backend/src/server/routes/hub-routes.js:314`), nibshare `relayX402Payment` (`backend/src/server/nibshare/controller.js:8`), subblog `serveAccess` (`subblogs/backend/src/routes/v1/nibgate.route.js:76`).
- No explicit `walletConnect()` connector in the wagmi config (`frontend/src/lib/wagmi.ts:34-38`) — verify mobile WalletConnect actually works for in-app wallets.
- `allowUnsupportedChain: true` (`frontend/src/lib/wagmi.ts:67`) means the app lets wallets stay on a non-Arc chain, then sign requests fail with the unauthorized error.
- `/api/auth/*` vs `/auth/*`: both are proxied (`frontend/next.config.ts:8-13` bare groups, `:27-29` `/api/:path*`), so NOT a bug — keep `/auth/*` for nibshare and `/api/auth/*` for hubSession as-is.

---

## 2. The standard

### 2.1 One wallet layer (`packages/wallet`)

A single shared module consumed by every surface (React hooks in `frontend`/`subblogs`, plain
functions in the vanilla SDK embed):

- `connect()` — AppKit modal (injected + WalletConnect). AppKit ships WalletConnect and
  EIP-6963 discovery out of the box (docs.reown.com/appkit/react/core/custom-connectors:
  "by default EIP-6963 and WC connectors are provided out of the box"); we also add an
  explicit `walletConnect()` wagmi connector so wagmi-side `connectAsync` can target it
  and the modal fallback always has a mobile path.
- `ensureArcNetwork()` — the chain guard (2.3).
- `getWalletErrorMessage(err)` — the error mapper (2.4).
- `signInSession()` — SIWE flow (2.2).
- `payAndUnlock(resource)` — the payment state machine (2.5).
- Single `arcTestnet` definition with one RPC URL, one `wallet_addEthereumChain` payload.

Kill: hand-rolled EIP-1193 in the SDK browser bundle and the self-rolled RPC/typed-data stack
in `GatewayWallet.tsx`. Same wallet, one driver.

### 2.2 Session sign-in = SIWE (EIP-4361), manual via `viem/siwe`

Decision (research-backed): implement SIWE ourselves with viem's first-class helpers —
`createSiweMessage`, `parseSiweMessage`, `validateSiweMessage`, `verifySiweMessage`
(`viem/siwe`) — **not** `@reown/appkit-siwe`. Reason: the AppKit SIWE plugin is
React/modal-oriented and can't serve the vanilla SDK embed or subblogs, it drags in the
`siwe` npm package, and it's mid-transition (siwe → siwx). viem is already our backend stack,
so no new dependency, and one message builder works on every surface.

Flow (client constructs the message; server asserts every binding field — the SIWE-recommended
"server controls what gets verified" model):

1. `GET /auth/nonce` → server stores a single-use nonce (10 min TTL), returns `{ nonce }`.
2. Client builds the message with `createSiweMessage`:
   `domain: window.location.host`, `uri: window.location.origin`, `address` (connected),
   `chainId: 5042002`, `nonce`, `version: "1"`, `statement: "Sign in to Nibgate to verify your wallet."`
   plus `issuedAt` + `expirationTime` (5–15 min).
3. `signMessageAsync({ message })` → wallet shows the standardized "NIBGATE WANTS YOU TO SIGN
   IN" screen (EIP-4361 requires origin verification in the wallet — this is what makes picky
   in-app wallets like Mises actually surface a sign prompt).
4. `POST /auth/verify { message, signature }` → server runs `parseSiweMessage` +
   `validateSiweMessage({ domain: <known host>, nonce: <stored nonce> })` +
   `verifySiweMessage`, then asserts `uri`, `chainId`, `version`, `expirationTime` against
   known values (domain checked against the `Host` header / allowlist — never trusted from the
   client). On success: clear nonce cookie, set `auth_session` cookie (unchanged: `httpOnly`,
   `secure`, `sameSite=lax`, 30-day).

Replace both duplicate `constructSignMessage` implementations with one shared builder in
`packages/internal/src/auth.js`.

### 2.3 Chain-guard: switch before you sign, always

Decision (research-backed): keep `allowUnsupportedChain: true` and rely on **wagmi's**
`useAccount().chainId` for the guard — never AppKit's network hooks
(`useAppKitNetwork`/`useAppKitNetworkCore` report the *first configured chain* after a page
refresh when on an unsupported chain — reown-com/appkit #4714, #5099). wagmi's `useAccount`
always reflects the real wallet chain.

Every flow that needs a signature runs `ensureArcNetwork()` first:

1. If wallet connected but on a chain ≠ Arc Testnet → show a "Switch to Arc Testnet" button.
2. Call `wallet_switchEthereumChain({ chainId: "0x4CEF52" })` (EIP-3326).
3. On error `4902` → `wallet_addEthereumChain(...)` then switch again.
4. Wait for `chainChanged` before issuing any sign request.

The guard runs before session sign-in too (this is the fix for the mobile silent-failure bug —
mobile wallets won't show the sign prompt until the chains match), before payment signing, and
before any gateway deposit/withdraw. Never auto-switch silently, and never let a
`personal_sign` / typed-data request go out while the wallet is on a foreign chain.

### 2.4 One error mapper

`getWalletErrorMessage(err)` used on every surface. Never show raw provider/hex strings.

| Condition | Message |
|---|---|
| code `4001` / "user rejected" / `UserRejectedRequestError` | "Request cancelled." (never logged as an error) |
| code `-32002` / "already pending" | "Check your wallet to approve the pending request." |
| code `4902` | handled by add+switch, never shown raw |
| code `4100` / `UnauthorizedProviderError` / "not been authorized" | "Reconnect your wallet and approve access, then try again." — and auto-retry once after `eth_requestAccounts` (wallet may not implement `wallet_requestPermissions`) |
| "insufficient funds" | "Insufficient balance for this payment." |
| `self_transfer` (Circle) | pre-empted by 2.5; if seen: "You're paying yourself — no payment needed." |
| anything else | "Something went wrong. Please try again." |

### 2.5 Payment / unlock state machine (x402)

Pay button runs a fixed sequence with a visible state label; every failure routes through 2.4:

`connect → ensureArcNetwork → self-pay check → sign payment auth → verify → unlock`

- **Self-pay check** (before any signing): if connected address == content creator address,
  skip payment entirely (show own content / note "This is your content"). Eliminates
  `self_transfer`.
- Sign the EIP-3009 / EIP-712 payment authorization only after `ensureArcNetwork` succeeded
  (`evm-gateway.js:126` already switches before signing — the standard makes that universal).
- Keep the `PAYMENT-REQUIRED` header + `x-nibgate-payment-proof` replay model.
- Consolidate the three relays onto one shared helper (refactor to
  `packages/internal/src/payments.js`).
- One gateway-balance endpoint instead of `/nibshare/gateway/balance` +
  `/api/nibgate/gateway/balance`.

### 2.6 Mobile connect UX rules

- Loading state within 100ms of tapping Connect (silence reads as broken).
- WalletConnect is the standard mobile bridge and AppKit provides it out of the box; the
  explicit `walletConnect()` connector guarantees a working path even when an in-app browser's
  injected provider misbehaves (Mises-class).
- Auto-reconnect on return (`reconnectOnMount` is already on); brief "Reconnecting…" state.
- Full-width ≥44px tap targets; never hide the connect button after a failure.
- Detect rejections as normal (`4001`), not exceptional.

---

## 3. Issue → fix traceability

| Reported issue | Documented cause | Fix in this standard |
|---|---|---|
| "requested method and/or account has not been authorized" | (1) chain mismatch at sign time (MetaMask-mobile #6701); (2) no `wallet_requestPermissions` support (wevm/viem #472) | 2.3 chain-guard runs before every sign; 2.4 maps 4100 + auto-retry with `eth_requestAccounts`; 2.1 adds WC path |
| "no signing prompt appears" (Mises) | non-SIWE message (wallets won't show a verified sign-in for it) + chain mismatch on mobile | 2.2 SIWE via `viem/siwe` (wallet renders the standard sign-in screen); 2.3 switch to Arc first |
| raw `self_transfer` error paying your own content | payer == creator reaches Circle's contract | 2.5 self-pay check before any payment signing |
| long "cody" errors when wrong chain | raw viem/Circle strings surfaced | 2.3 proactive switch prompt; 2.4 one error mapper, no raw strings |
| mobile connect unreliable / no WalletConnect | no `walletConnect()` connector; relying on AppKit network hooks | 2.1 explicit WC connector; 2.3 use wagmi `useAccount().chainId` (not AppKit hooks — #4714/#5099) |

---

## 4. Migration plan

1. **Foundation** (done): create `packages/wallet` (single `arcTestnet` def, `ensureArcNetwork`,
   error mapper incl. 4100 auto-retry, `viem/siwe` message builder). Add `walletConnect()`
   connector to `frontend/src/lib/wagmi.ts`. Land SIWE backend change (`auth-routes.js` +
   `packages/internal/src/auth.js`, one shared builder, remove CLI duplicate).
2. **Hub/nibshare frontend** (done): migrate `useNibgateConnect`, `SigninFlow`, `WalletButton`,
   `ShareWallet`, share/mine pages onto `packages/wallet`; chain-guard before sign-in.
3. **Pay/unlock UI** (done): `UnlockGate` / SDK `default-ui` surfaces run the 2.5 state
   machine — chain-guard before signing (`ensureArcNetwork`), self-pay check before any
   signing (`evm-gateway.js` checkout: payer == challenge `accepts[0].recipient` →
   skip payment), all errors through `getWalletErrorMessage`.
4. **Subblogs** (done): `GatewayWallet.tsx` self-rolled JSON-RPC/typed-data stack replaced
   with `@nibgate/wallet` (`switchToArcNetwork`, `getWalletErrorMessage`); drpc RPC URL
   removed; `@nibgate/wallet` added as a dependency.
5. **SDK embed** (done): hand-rolled EIP-1193 swapped for the vanilla API of `packages/wallet`
   (`reputation.js`, `evm-gateway.js`, `default-ui.js`, `rating-ui.js`); the site widget
   (`frontend/public/widget.js`, zero-dependency CDN script) carries the same chain-guard +
   error mapping inline. Published as `@nibgate/wallet@0.1.0`; `@nibgate/sdk` republished
   (0.4.5) with `@nibgate/wallet` as a dependency, and subblogs updated to consume it.
6. **Consolidation** (done): single chain def + single message builder in `packages/wallet`
   (and `packages/internal/src/auth.js`); shared x402 relay helper + shared
   `gatewayBalance` in `packages/internal/src/payments.js`, now used by the nibshare
   controller, hub `/api/hub/pay`, and nibshare service. The subblog `serveAccess` relay
   proxies to `/api/hub/pay`, so it rides the shared helper too.

---

## 5. Decisions (open questions, resolved by research)

- **AppKit SIWE plugin vs manual?** Manual, via `viem/siwe` (see 2.2). No new dependency,
  works across React + vanilla embed + subblogs, server asserts all binding fields. The
  AppKit plugin (and `siwe` npm pkg) would only serve the React modal and duplicates what
  viem already gives us.
- **`allowUnsupportedChain`?** Keep `true`, and enforce the chain-guard with wagmi's
  `useAccount().chainId`. Setting it `false` would force an AppKit network-switch dialog on
  connect (bad for pure login and can fail on Mises); the documented refresh bug in AppKit's
  own network hooks (#4714/#5099) is why we must not read the chain from AppKit hooks.
- **Is WalletConnect available without an explicit connector?** Yes — AppKit provides WC +
  EIP-6963 out of the box (custom-connectors docs). We still add an explicit
  `walletConnect()` connector so wagmi's `connectAsync` and the modal fallback always have a
  mobile path. Residual risk (unverifiable without a physical Mises device): whether Mises'
  injected provider cooperates — mitigated by the WC path + 4100 auto-retry + chain-guard.
