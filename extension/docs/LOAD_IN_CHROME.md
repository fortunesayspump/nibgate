# Load Nibgate in Chrome (sideload — no store review needed)

For the hackathon we ship **unpacked**. Reviewers and judges sideload in
under a minute. Never submit this testnet build to the Chrome Web Store.

## Steps

1. Build the extension:
   ```bash
   cd extension
   npm install
   npm run build   # outputs dist/
   ```
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select the `extension/dist/` folder.
5. Pin it: puzzle-piece icon → pin **Nibgate**.
6. Open any article (not a `*.nibgate.xyz` page — those are excluded, they
   already have native tipping). The tip card appears bottom-right.
7. Fund a wallet with **testnet** USDC (Circle faucet:
   `https://faucet.circle.com`) — never mainnet funds in this build.

## Live editing (watch mode)

1. Run `npm run dev` and leave it running — it rebuilds `dist/` on every save.
2. After saving: `chrome://extensions` → circular-arrow ↻ on the Nibgate card.
3. Then hard-refresh the test page (content script) or close + reopen the popup.
4. Keep DevTools open on the page for content-script logs; use
   `chrome://extensions` → **Inspect views: service worker** for background logs.

Chrome never auto-reloads unpacked extensions, so the ↻ click is always
needed — but you never re-run the build by hand.

## What reviewers verify

- Card appears on ordinary articles, stays hidden on non-content pages.
- Tip buttons fire the challenge → wallet sign → verify flow against
  `https://testnet-api.nibgate.xyz`.
- Popup shows tip history for the session.
- No mainnet hosts anywhere: `grep -r "api.nibgate.xyz\|eip155:5042" dist/`
  must return nothing (testnet-only build).

## Local dev loop

1. Run the hub locally (`PORT=3005`, local Postgres per `e2e/` setup).
2. Popup → Settings → dev hub override: `http://localhost:3005` → Save.
   All hub calls (resolve, challenge, verify, holds, balances read the
   active network) now hit local. Blank the field to return to prod hosts.
3. `npm run build` after any `src/` change, then hit reload on
   `chrome://extensions`. Popup onboarding (create/import/unlock) and the
   E2E suite (`pnpm exec playwright test --config=e2e/extension.config.ts`)
   cover the rest.

## Icons

`icons/` holds the SVG master only. Before any store submission (post-hackathon),
export PNGs at 16/48/128px. Unpacked sideload works without them.
