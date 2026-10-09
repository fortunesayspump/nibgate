# Load Nibgate in Chrome (sideload — no store review needed)

Sideload `dist/` for dev and review. The same build was submitted to the
Chrome Web Store as v1.0.1 (awaiting review — see `STORE_SUBMIT.md`).
Testnet default, mainnet behind the confirm-gated header pill.

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
6. Enable site access: on Home tap **Enable on all sites** (or Settings →
   **Tip button on web pages** → Enable). This grants the optional access
   that lets the tip button appear; an already-open tab picks it up
   immediately (otherwise reload the tab).
7. Open any article (not a `*.nibgate.xyz` page — those are excluded, they
   already have native tipping). The coffee-button tip trigger appears near
   the content.
8. Fund the wallet: **testnet** USDC via the Circle faucet
   (`https://faucet.circle.com`) for play-money tips, or tap the header
   network pill → **Mainnet** (confirm-gated) for real USDC on Arc.

## Live editing (watch mode)

1. Run `npm run dev` and leave it running — it rebuilds `dist/` on every save.
2. After saving: `chrome://extensions` → circular-arrow ↻ on the Nibgate card.
3. Then hard-refresh the test page (content script) or close + reopen the popup.
4. Keep DevTools open on the page for content-script logs; use
   `chrome://extensions` → **Inspect views: service worker** for background logs.

Chrome never auto-reloads unpacked extensions, so the ↻ click is always
needed — but you never re-run the build by hand.

## What reviewers verify

- The **Enable on all sites** prompt grants optional site access; the content
  script registers only after the user taps it (no install-time broad access).
- Card appears on ordinary articles, stays hidden on non-content pages.
- Tip buttons fire the challenge → wallet sign → verify flow against the
  active network (`testnet-api.nibgate.xyz` by default, `api.nibgate.xyz`
  on mainnet).
- Popup shows the wallet shell: onboarding, lock, home, activity, send,
  receive, gateway deposit/withdraw, settings. Network switches via the
  header pill (testnet default, mainnet confirm-gated).

## Local dev loop

1. Run the hub locally (`PORT=3005`, local Postgres per `e2e/` setup).
2. Point the extension at it with a build-time override
   (`NIBGATE_HUB_API=http://localhost:3005 npm run build`) — there is no
   popup UI for this; the override is stored on-device and blanked by
   rebuilding without it. All hub calls (resolve, challenge, verify, holds,
   balances read the active network) now hit local.
3. `npm run build` after any `src/` change, then hit reload on
   `chrome://extensions`. Popup onboarding (create/import/unlock) and the
   E2E suite (`e2e/extension.config.ts`, `e2e/wallet.config.ts` — local-only,
   gitignored) cover the rest.

## Icons

`icons/` holds the SVG masters plus the store-ready PNG set
(`icon16/48/128.png`). No export step left.
