# Load Nibgate in Chrome (sideload — no store review needed)

Sideload `dist/` for development and review. Version 1.2.0 remains live on
the Chrome Web Store; this source builds the 1.2.1 release candidate (see
`STORE_SUBMIT.md`). Deploy and verify the dual-compatible Hub backend before
publishing the store update.
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
7. Open a high-confidence creator post (not a `*.nibgate.xyz` page — those are excluded, they
   already have native tipping). The coffee-button tip trigger floats at the
   bottom right. Dismiss it with **×** for the current page; the full **Tip the
   creator** button at the content's end and the right-click **Tip this page**
   action stay available.
8. Fund the wallet: on **testnet** tap the home-screen **Faucet** action — it
   copies your address and opens the Circle faucet
   (`https://faucet.circle.com`) where you pick Arc Testnet and request free
   play-money USDC. The Faucet action hides on mainnet (real USDC only).
   Switching networks: header pill → the other network (mainnet is
   confirm-gated).

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
   popup UI for this; it is compile-time only and blanked by rebuilding without
   it. All hub calls (resolve, challenge, verify, holds,
   balances read the active network) now hit local.
3. `npm run build` after any `src/` change, then hit reload on
   `chrome://extensions`. Popup onboarding (create/import/unlock) and the
   E2E suite (`e2e/extension.config.ts`, `e2e/wallet.config.ts` — local-only,
   gitignored) cover the rest.

## Icons

`icons/` holds the SVG masters plus the store-ready PNG set
(`icon16/48/128.png`). No export step left.
