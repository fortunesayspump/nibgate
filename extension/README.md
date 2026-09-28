# Nibgate Extension (human interface) — pre-build scope

Status: design only. No code, no commits, no pushes until the hackathon window.
Part of the Tameion trio (`tipping/` = protocol, `extension/` = humans,
`dr-nib/` = agents). See `../tameionhack.md` for the full plan.

## What it is

A browser extension that makes any article/tutorial/paper tippable in place.
Open a page → the extension identifies **the specific content** (not just the
site), resolves the creator, injects a tip UI ($0.25 / $1 / custom) → pays
over Gateway/direct x402 rails. Same protocol as unlocks, no new backend.

## How it works

1. **Content extraction** — title, author, canonical URL, body fingerprint
   (Readability-style; 80% accuracy is enough for v1).
2. **Creator resolution** — page signals → hub `/hub/resolve` → JEV confidence.
   Below threshold: show "unclaimed — your tip will be held" state, never pay blind.
3. **Tip UI** — injected card, wallet connect (reuse `@nibgate/wallet` patterns),
   amount presets, one-click pay, receipt inline.
4. **Receipts** — same receipt shape as unlocks (`type: 'tip'`), so hub
   Explore/ledger/earnings count them with no new machinery.

## JEV judgments per page

- is-this-content (vs nav/ads/chrome)
- creator identity + confidence
- tipping appropriateness for this piece
- recipient (author vs publication — default publication, flag for later)
- suggested amount

## Ship constraints (hackathon)

- Unpacked sideload + demo video. No store review inside the window.
- Testnet only. `NEXT_PUBLIC_NIBGATE_NETWORK=testnet` equivalent scoping.
- Bots/agents do NOT use the extension — they use the skill.md API route.

## Build order

Content extractor → resolution client → tip UI → receipt display. Wallet +
rails come from the existing packages; this folder holds only the extension
shell, content scripts, and JEV prompt schemas (JEV core itself lives in `jev/`).

## Structure

```text
extension/
  manifest.json            # MV3: content scripts, worker, popup, testnet hosts
  package.json / tsconfig  # TS + esbuild, no framework
  src/
    content/extract.ts     # article identification (title/author/canonical/fingerprint)
    content/tip-card.ts    # injected tip card UI + messaging
    background/service-worker.ts  # API + payment flow (keys never touch pages)
    popup/popup.html/.ts   # wallet pairing + tip history
    lib/api-client.ts      # hub tip API per active network (challenge/verify/resolve)
    lib/network.ts         # testnet default, mainnet behind confirm-gated toggle (persisted)
  scripts/build.mjs        # esbuild → dist/
  icons/nibgate.svg        # master (export PNGs only for store submission)
  icons/nibgate.svg + icon16/48/128.png  # master + store-ready raster set
  docs/LOAD_IN_CHROME.md   # sideload in under a minute
  docs/STORE_SUBMIT.md     # store submission (post-hackathon)
  README.md                # this file
```

Build: `npm install && npm run build` → load `dist/` unpacked.
Bots/agents skip the extension entirely — they use the skill.md API route.
