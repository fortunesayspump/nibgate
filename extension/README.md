# Nibgate Extension — tip & unlock creator content anywhere on the web

Status: working beta, heading to the Chrome Web Store. Sideload `dist/` today;
store submission runs in parallel (see `docs/STORE_SUBMIT.md`).

Part of the trio (`tipping/` = protocol, `extension/` = humans, `dr-nib/` = agents).
See `../tameionhack.md` for the full plan.

## What it is

A browser extension that makes any article/tutorial/paper tippable in place.
Open a page → the extension identifies **the specific content** (not just the
site) and shows a coffee-button tip trigger → the extension window handles amount,
review, and approval → pays over Gateway/direct x402 rails. Same protocol
as unlocks, no new backend. Nothing about money renders in the page, so
pages can't spoof it.

## How it works

1. **Content extraction** — title, author, canonical URL, body fingerprint
   (Readability-style; 80% accuracy is enough for v1).
2. **Creator resolution** — page signals → hub `/hub/resolve` → JEV confidence.
   Below threshold: show "unclaimed — your tip will be held" state, never pay blind.
3. **Tip UI** — injected card, wallet connect (reuse `@nibgate/wallet` patterns),
   amount presets, one-click pay, receipt inline.
4. **Receipts** — same receipt shape as unlocks (`type: 'tip'`), so hub
   Explore/ledger/earnings count them with no new machinery.

## Networks

One build serves both networks. **Testnet by default** (free faucet USDC);
flip to **mainnet** in popup Settings (confirm-gated) for real tips.
See `src/lib/network.ts`.

## JEV judgments per page

- is-this-content (vs nav/ads/chrome)
- creator identity + confidence
- settle-vs-hold gate for declared (unverified) page wallets
- recipient inference among DOM candidate wallets (confident picks only)
- held-tip flow for unknown creators (owner claims later, payer can refund)

## Ship constraints

- Sideload + store submission in parallel — never gate building on approval.
- Testnet default; mainnet behind the confirm-gated Settings toggle.
- Bots/agents do NOT use the extension — they use the skill.md API route.

## Build order (done, in maintenance)

Content extractor → resolution client → tip UI → receipt display. Wallet +
rails come from the existing packages; this folder holds only the extension
shell, the injected content script, and JEV prompt schemas (JEV core itself
lives in `jev/`).

## Structure

```text
extension/
  manifest.json            # MV3: worker, popup, dual-network hosts, optional site access
  package.json / tsconfig  # TS + esbuild, no framework
  src/
    content/extract.ts     # article identification (title/author/canonical/fingerprint)
    content/tip-card.ts    # injected tip card UI + messaging
    background/service-worker.ts  # API + payment flow (keys never touch pages)
    popup/popup.html/.ts   # wallet shell: onboarding, send/receive, history, settings
    lib/api-client.ts      # hub tip API per active network (challenge/verify/resolve)
    lib/network.ts         # testnet default, mainnet behind confirm-gated toggle (persisted)
    lib/embedded-wallet.ts # self-custodial vault (keys encrypted on-device)
    lib/gateway-pay.ts     # Circle Gateway rail
  scripts/build.mjs        # esbuild → dist/
  icons/nibgate.svg + icon16/48/128.png  # master + store-ready raster set
  docs/LOAD_IN_CHROME.md   # sideload in under a minute
  docs/STORE_SUBMIT.md     # store submission checklist + steps
  README.md                # this file
```

Build: `npm install && npm run build` → load `dist/` unpacked.
Bots/agents skip the extension entirely — they use the skill.md API route.
