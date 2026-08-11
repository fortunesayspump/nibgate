# Wallet Connect Follow-ups

Tracked gaps from the wallet-connect flow audit (hub, subblogs, SDK, widget). Items are ordered by priority. Each entry has a suggested fix and the code location.

## P1 — Mobile sign-in can fail silently on the wrong chain

- `frontend/src/app/signin/page.tsx` → `SigninFlow` (`frontend/src/components/SigninFlow.tsx:93,115`) opens the AppKit modal and signs directly, with no Arc Testnet chain guard. The hub config sets `allowUnsupportedChain: true` (`frontend/src/lib/wagmi.ts:48`), so a wallet left on another chain gets a sign request that fails (documented in `WALLET-STANDARD.md:19-27`).
- `useNibgateConnect` does the right thing but swallows the switch error (`frontend/src/lib/useNibgateConnect.ts:31-35`), so "connected" can silently mean "connected on the wrong chain".
- Fix: route `/signin` through the same `ensureArcNetwork` guard used by the SDK (`packages/wallet/src/network.js`), and surface the switch failure instead of `catch {}`.

## P2 — Subblogs / SDK / widget have no mobile pairing path

- `packages/nibgate/src/browser/evm-gateway.js:85` and `frontend/public/widget.js:223-227` connect via `window.ethereum` (`eth_requestAccounts`) only. No WalletConnect/QR/deep-link anywhere in subblogs or the SDK browser code (grep-confirmed). A visitor on mobile Safari/Chrome (no in-app wallet browser) cannot connect or pay.
- The hub is the only surface with a `walletConnect` connector + QR (via Reown AppKit) — and even that is AppKit-internal.
- Fix: add a WalletConnect/QR fallback to `@nibgate/sdk`'s browser connect, or document in-app-browser-only support and surface a clear "open in MetaMask/Mises" prompt on mobile.

## P3 — Widget and GatewayWallet use raw `eth_signTypedData_v4`

- `frontend/public/widget.js:258-261` (payment proof) and `subblogs/frontend/src/components/GatewayWallet.tsx:184-187` (Circle withdraw) call `eth_signTypedData_v4` directly. The SDK deliberately avoids this because hash encoding differs across wallets (`packages/nibgate/SKILL.md:319,326,721`) and uses viem `signTypedData` instead (`evm-gateway.js:147-159`).
- Fix: port both call sites to viem's `signTypedData` via a `custom(window.ethereum)` wallet client.

## P4 — Widget chain metadata / connect gaps

- `frontend/public/widget.js:198-208` `switchToArc()` sends `wallet_addEthereumChain` with `nativeCurrency: USDC`, mismatching `@nibgate/wallet`'s chain definition (`packages/wallet/src/chain.js`).
- The widget's connect button (`widget.js:294-304`) only requests the account — it never switches to Arc. A user who connects first on another chain stays "Connected" with a broken unlock.
- Fix: reuse `@nibgate/wallet`'s chain guard in the widget (it already ships the errors/network helpers) and switch on connect.

## P5 — Mobile header connect depends on the desktop component

- `WalletButtonMobile` (`frontend/src/components/WalletButton.tsx:229`) has no click handler of its own; its `data-wallet-connect` button is serviced by the desktop `WalletButton`'s global `document` listener (`WalletButton.tsx:179-206`). Both are always mounted so it works today, but rendering the mobile button in isolation silently breaks connect.
- Also `hasInjected` is a snapshot at render (`useNibgateConnect.ts:20-21`) — no EIP-6963 `eip6963:announceProvider` listener, so late-injecting mobile wallets are only caught on re-render.
- Fix: give `WalletButtonMobile` its own handler (call `useNibgateConnect().connect()` directly) and subscribe to EIP-6963.

## P6 — Stale/one-shot SDK unlock UX

- `NibgateUnlock.tsx:118-131` re-checks a stored payment proof only on mount; post-unlock chain/account switches don't re-verify.
- `default-ui.js:159-166` disables the unlock button until connected, and the only connect entry is tapping the wallet label (`default-ui.js:219-223`) — poor discovery on mobile.

## P7 — Pre-existing lint debt (not from recent changes)

- `pnpm --filter @nibgate/frontend lint` reports 46 errors / 59 warnings, all pre-existing and untouched: `no-explicit-any` in `WalletButton.tsx:57-95`, `GatewayWallet`, dashboard pages; `react-hooks/set-state-in-effect` in `useNibgateConnect.ts:17`, `sites/page.tsx:170,630`, `contents/page.tsx:79`; unused imports (`wagmi.ts:4`, `blog/page.tsx:5`).
- Suggested: fix in a dedicated lint-cleanup PR so lint can gate CI.

## P8 — Read-only GETs still use bare `res.json()`

- `dashboard/profile/page.tsx:78`, `components/DashboardSidebar.tsx:43`, `ledger/page.tsx:81,100`, `leaderboards/page.tsx:13,24`, `explore/*`, `ns/[slug]/page.tsx`, `blog/page.tsx:30`, sitemap/llms route handlers. Read-only GETs against the same-origin backend (always JSON); low risk vs the POST/PUT write paths that are now hardened via `frontend/src/lib/upload.ts`.
- Fix (optional): a shared `readJson` helper mirroring `uploadJson`.

## Done (closed during the audit)

- Dead deps removed from `frontend/package.json`: `ethers@5`, `siwe@3`, `@web3modal/ethers5`, `porto`, `@metamask/connect-evm`.
- Dead bridge globals removed: `window.nibgateWalletAddress`, `window.nibgateAuthenticated`, `sessionStorage 'nibgate-wants-redirect'`.
- Unused `useAppKit().open` in `WalletButtonMobile` removed.
- All hub POST/PUT write-path responses hardened against non-JSON bodies via centralized `frontend/src/lib/upload.ts` (share uploaders, dashboard profile upload/save, blog cover upload, sites link-generate).
