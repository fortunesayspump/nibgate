# Chrome Web Store submission

Two tracks: **sideload for dev/review** (`LOAD_IN_CHROME.md`), **store
submission in parallel now** so review runs while we build. Do NOT gate
building on store approval.

## Review reality (checked Sep 2026)

- **Not instant.** New developer account + new extension + broad host
  permissions (`http(s)://*/*` content scripts) + payment-adjacent behavior =
  every "closer inspection" signal. Expect **days to weeks**; Google gives no
  SLA (support escalation only after 3+ weeks stuck).
- Updates to an already-approved item review faster than first submissions.
- Never cancel + resubmit while pending — it rejoins the back of the queue.

## Pre-submit checklist

- [x] `npm run build` clean, `dist/` contains manifest + 3 bundles + icons
- [x] Icons present: `icons/icon16|48|128.png` (store requires all three)
- [x] No `console.log` in `src/`; dual-network copy (testnet default, mainnet toggle)
- [x] Privacy policy page — hosted at `https://nibgate.xyz/extension-privacy`
  (`frontend/src/app/extension-privacy/page.tsx`). Extension requests
  `activeTab` (current page only), `storage` (tip history + network pref),
  page content for extraction. No analytics, no remote code, no data sale.
- [ ] Store description + 1280×800 screenshots (record the killer demo).

## Steps

1. Pay the one-time $5 Chrome Web Store developer fee (Google account).
   New accounts may face identity verification — do it immediately, it gates everything.
2. Developer Dashboard → New item → upload `extension/nibgate-1.0.0.zip` (built from a clean `npm run build`).
3. Fill listing (copy below): name `Nibgate`, category Productivity,
   privacy policy URL `https://nibgate.xyz/extension-privacy`,
   support email `hello@nibgate.xyz`.
4. Submit the **testnet-default** build first (honest description: testnet play
   money). Do NOT wait for approval to continue building.
5. When live, use **staged rollout** (e.g. 20% → 100%) for the mainnet-default
   flip so a bad build doesn't hit every user at once.

## Listing copy

Short description (132 chars):
`Tip any creator on the web with USDC. Play money on testnet; flip to mainnet in settings for real tips.`

Full description:
```
Nibgate puts a tip button on every article, tutorial, and paper you read.

• One tap on the coffee button opens the Nibgate tip window
• Pick $1, $5, $10 or a custom amount — review, approve, done
• Tips settle in USDC on Arc, directly or via Circle Gateway
• Unknown creators? Your tip waits safely until they claim it — or refund yourself in one tap
• Self-custodial wallet built in: your keys never leave this device

Starts on Arc Testnet with free faucet USDC (play money only). When you're
ready for real tips, flip to Mainnet in Settings — with an explicit
confirmation, so it never happens by accident.

Support: hello@nibgate.xyz · Privacy: https://nibgate.xyz/extension-privacy
```

Screenshots (1280×800, in `e2e/screenshots/` — composed feature frames, dark
canvas + headline left + product crop right; regenerate raws with
`node e2e/store-shots.mjs`, compose with `node e2e/promo/frames-shots.mjs`):
`store-01-home.png` (Tip every creator), `store-02-article.png` (One tap),
`store-03-review.png` (Review before signing), `store-04-activity.png`
(Held safe), `store-05-receive.png` (Get tipped back).
Promo: `promo-small-440x280.png` (required), `promo-marquee-1400x560.png`
(`node e2e/promo-shots.mjs`).

## Network policy

- Ship default **testnet**, mainnet behind the confirm-gated toggle.
- Flip the default only when mainnet tipping is fully live + keeper active.
- The toggle + per-network hosts mean one listing serves both networks.
