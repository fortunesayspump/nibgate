# Nibgate Work Summary

## Objective
- Unify subblogs and all unlock flows (hub nibshare `UnlockGate`, subblogs `NibgateUnlock`/`GatewayWallet`) on the same Reown (AppKit + wagmi) modal, wallet connection, and SIWE auth as the hub header — sharing code via `@nibgate/wallet`'s `./react` entry (published `@nibgate/wallet@0.2.10`).

## Important Details
- **Shared package:** `packages/wallet` now ships a `./react` entry: `createNibgateWallet` (idempotent AppKit factory), `<NibgateWalletProvider>`, `useNibgateConnect` (auto-SIWE), SIWE/session helpers, `useNibgateUnlock` + `<NibgateUnlock>` (wagmi `useAccount`/`useSignTypedData`, `x-nibgate-payment-proof` flow), and re-exports of wagmi/appkit/react-query (single-instance guarantee — import these ONLY via `@nibgate/wallet/react`; direct imports duplicate the WagmiProvider context → SSR `useConfig` crash).
- **Stale-state version guard (0.2.9):** `createNibgateWallet` runs `clearStaleWalletStateIfVersionChanged()` BEFORE `createAppKit` reads localStorage — wipes `@appkit/*`, `@w3m-app/*`, `@w3m-frame/*` keys, `wagmi.store`, `walletconnect`, then stamps `localStorage['nibgate.wallet.state-version'] = STORAGE_VERSION`. Fixes "stuck at Connecting" hang caused by stale AppKit/wagmi state from earlier broken sessions (per-origin, so it hit localhost:3001 but not 3002). Bump `STORAGE_VERSION` whenever the wallet bumps so clients re-clear once.
- **4100 re-auth fix (0.2.10):** after connect, MetaMask can throw error 4100 ("The requested method and/or account has not been authorized") on the SIWE `personal_sign` when the origin's stored permission is stale/for a different account. `ensureWalletAuthorized(connector)` (`src/react/authorize.js`) re-requests `eth_requestAccounts` through the active connector's provider right before every sign (`useNibgateConnect.sign`, `unlock.jsx` `signInIfEnabled` + `checkout`). Resolves instantly without a popup when already authorized; otherwise prompts once to authorize the current account. Errors are swallowed — the real sign surfaces genuine failures.
- **Dependency graph (the hard-won part):** `@nibgate/wallet@0.2.3+` declares wagmi/appkit/adapter/react-query as **exact-pinned peerDependencies**; each consuming app declares them as exact deps too. Known-good set: `wagmi 3.6.21`, `@reown/appkit 1.8.21`, `@reown/appkit-adapter-wagmi 1.8.21`, `@tanstack/react-query 5.101.2`, `viem 2.54.1`, with npm/pnpm `overrides` pinning `@wagmi/connectors 8.0.20`, `@wagmi/core 3.5.5`, `@base-org/account 2.4.0`.
- **Webpack vs Turbopack gotcha:** wagmi's connector graph imports optional packages that DON'T exist on npm (`@x402/svm/exact/client`, `accounts`, `@walletconnect/ethereum-provider`, `porto`, `@metamask/connect-evm`). Next 16 **Turbopack** (hub `next build`) resolves lazily and ignores them; **webpack** (subblogs Next 15 build, and hub `next dev --webpack`) eagerly fails. Both apps' `next.config` now stub them via `webpack(config){ config.resolve.fallback = {...} }`. If new module-not-found errors appear in webpack builds from this tree, add the module name to that fallback list. **Hub `next.config` must ALSO set `turbopack: {}`** — Next 16 errors on a `webpack` config without any `turbopack` config.
- **pnpm/npm trap:** subblogs/frontend `package.json` previously had `"packageManager": "pnpm@10.28.0"`, so corepack silently rerouted `npm install` to pnpm (corrupt pnpm-style `node_modules/.pnpm` + workspace symlink into the monorepo). Removed the field; subblogs is now clean npm. Monorepo root stays pnpm (workspaces: `docs`, `frontend`, `backend`, `packages/*`; subblogs is NOT a member).
- AppKit v1.8.21 `useAppKit()` returns `{open, close}` (NO `disconnect`); the old `useDisconnect as useAppKitDisconnect` from `@reown/appkit/react` was a latent bug — disconnect uses wagmi's `useDisconnect`.
- `.jsx`/`.js` ship in source → consuming Next apps need `transpilePackages: ["@nibgate/wallet"]`; TS types live in `src/react/index.d.ts` (`import type` is invalid in `.js`).
- Subblogs backend: full SIWE (nonce/verify/session/logout) in `services/siwe.service.js` + `/auth/*` routes, HttpOnly JWT cookies `sb_auth_nonce`/`sb_auth_session`, Prisma `User.walletAddress` + index. Verified end-to-end with an anvil key.
- Ports: hub backend 3000, hub frontend 3001, subblogs backend 4000, subblogs frontend 3002. Postgres: `pg_ctl -D /opt/homebrew/var/postgresql@16 start`; DBs `nibgate_hub` + `nibgate_blog`. Logs: `/tmp/opencode/nibgate-logs/{hub-backend,hub-frontend,subblog-backend,subblog-frontend}.log`.
- Prior task recap: share cover-upload fix committed `cea4207` (NOT yet pushed); wallet rollout (SIWE sign-in, SDK unlock/rating embeds, subblogs GatewayWallet, widget.js) via `@nibgate/wallet@0.1.0` + `@nibgate/sdk@0.4.5`, commit `6aac19c` pushed to `origin/main`.

## Work State
### Completed
- **Stale-state hang root-caused + fixed (0.2.9):** hub's "stuck at Connecting" was stale AppKit/wagmi localStorage on the localhost:3001 origin (not code) — hub and subblogs run identical wallet code (0.2.8, appkit 1.8.21, wagmi 3.6.21), single provider mount, no direct wagmi/appkit imports in hub src, single wagmi/appkit copy in the served bundle, `/auth/nonce` 200. Version guard `clearStaleWalletStateIfVersionChanged()` wipes AppKit/wagmi keys before `createAppKit`, then stamps the version marker. Verified in Puppeteer (seed 0.2.8 marker + stale keys → reload → cleared, fresh empty `wagmi.store` chainId 5042002, marker 0.2.9) and confirmed served in both apps' chunks.
- **4100 re-auth fix (0.2.10):** MetaMask `personal_sign` was throwing 4100 on hub + share after connect (per-origin stale/other-account authorization). Added `ensureWalletAuthorized(connector)` (re-requests `eth_requestAccounts` through the active connector's provider) before every SIWE sign and the gateway `signTypedData`. Repacked `nibgate-wallet-0.2.10.tgz` → subblogs (removed 0.2.9 tarball), bumped `STORAGE_VERSION` to 0.2.10, both builds green, both dev servers restarted (hub pid 79170→79215, subblogs 79172→79220), `/`, `/ns/bgYyjNKc`, subblog post all 200, helper confirmed in both apps' chunks.
- **Gateway balance display parity:** hub share page showed `· ` (empty) after connect while subblogs showed `· 0.00 USDC` — NOT a code diff. Both backends call Circle `POST gateway-api-testnet.circle.com/v1/balances` with the same body `{token:"USDC", sources:[{depositor, domain:26}]}` (domain 26 = Arc testnet per Circle docs; response `balance` is a decimal string). Root cause: hub `backend/.env` was MISSING `CIRCLE_API_KEY`, so `packages/internal/src/payments.js` `gatewayBalance()` returned `''` → `{balance:''}` → empty UI. Copied the key from `subblogs/backend/.env`, restarted hub backend (pid 3514→80897), endpoint now returns `{"balance":"0.00 USDC"}` direct + via the 3001 proxy.
- **0.2.4/0.2.5 Lottie unlock UI** shipped in the shared wallet (`NibgateUnlockUI` SDK-style card, unlock-key Lottie, "Hold to pay"); hub + subblogs both use it.
- Hub migrated to shared package (providers, wagmi re-export, connect/session/siwe re-exports, WalletButton/ShareWallet/SigninFlow/DashboardSidebar/ActivityBell/share pages, UnlockGate → `<NibgateUnlock>`); removed broken AppKit disconnect.
- Subblogs migrated: `WalletProviders.tsx` wraps `<NibgateWalletProvider>` (root layout), `NibgateUnlock.tsx` → shared `<NibgateUnlock>`.
- Both frontends' `next.config` get the webpack `resolve.fallback` stubs; hub `next.config` sets `turbopack: {}`.
- Subblogs backend SIWE added + verified (nonce→verify→session from anvil key); builds pass (hub pnpm, subblogs npm).

### Active
- User to verify 0.2.10 in a real browser against the dev servers: hub header connect → SIWE sign-in should no longer 4100 (MetaMask may show ONE extra "Connect account" prompt the first time if the origin permission was stale); then share `/ns/bgYyjNKc` gate connect + hold-to-pay; subblogs 3002 gate.

### Blocked
- Real-MetaMask flows can't be automated (Chrome blocks `--load-extension` in Puppeteer; mock `window.ethereum` can't drive the AppKit modal).

## Next Move
1. User test: connect + SIWE on hub 3001 (header + `/ns/bgYyjNKc`) and subblogs 3002 with MetaMask. If 4100 persists, also try MetaMask → Settings → Connected sites → remove localhost:3001 once.
2. Work `FOLLOWUPS.md` P1–P8 + wallet-unify follow-ups (ReputationRating raw `window.ethereum`, dead `GatewayWallet.tsx`, widget.js Reown parity, verify-500-on-empty-body robustness).
3. Commit + push pending work (hub/subblogs wallet unification, 0.2.9 guard, 0.2.10 4100 fix, `cea4207` upload fix, wallet publishes).


## Relevant Files
- `packages/wallet/package.json` + `src/react/{index.js,index.d.ts,appkit.js,authorize.js,NibgateWalletProvider.jsx,siwe.js,session.js,useNibgateConnect.js,unlock.jsx,unlock-key.js}` — shared `./react` entry (`authorize.js` = 4100 `eth_requestAccounts` re-auth).
- `frontend/src/lib/{wagmi.ts,useNibgateConnect.ts,hubSession.ts,siweAuth.ts}`, `app/providers.tsx`, `components/{WalletButton,SigninFlow,DashboardSidebar,ActivityBell}`, `features/nibshare/components/{UnlockGate,ShareWallet}`, `app/share/[_page].tsx`, `next.config.ts`.
- `subblogs/frontend/src/components/{NibgateUnlock,GatewayWallet,WalletProviders}`, `app/layout.tsx`, `next.config.ts`, `package.json` (npm; overrides block).
- `subblogs/backend/src/{services/siwe.service.js,controllers/auth.controller.js,routes/v1/auth.route.js,app.js,config/config.js,middlewares/auth.js}`, `prisma/schema.prisma` (User.walletAddress).
- `packages/nibgate/src/browser/{default-ui,evm-gateway,access,gateway}.js`; `subblogs/backend/src/routes/v1/nibgate.route.js`.
- Env: `backend/.env`, `frontend/.env`, `subblogs/backend/.env`, `subblogs/frontend/.env.local`.
- `FOLLOWUPS.md` — wallet-connect + wallet-unify follow-ups.
