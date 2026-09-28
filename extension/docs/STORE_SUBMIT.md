# Chrome Web Store submission

Two tracks: **sideload for the event** (`LOAD_IN_CHROME.md`), **store submission
in parallel now** so review runs while we build. Do NOT gate the hackathon on
store approval.

## Review reality (checked Sep 2026)

- **Not instant.** New developer account + new extension + broad host
  permissions (`http(s)://*/*` content scripts) + payment-adjacent behavior =
  every "closer inspection" signal. Expect **days to weeks**; Google gives no
  SLA (support escalation only after 3+ weeks stuck).
- Updates to an already-approved item review faster than first submissions.
- Never cancel + resubmit while pending — it rejoins the back of the queue.

## Pre-submit checklist

- [ ] `npm run build` clean, `dist/` contains manifest + 3 bundles + icons
- [ ] Icons present: `icons/icon16|48|128.png` (store requires all three)
- [ ] No `console.log` with secrets; no testnet-only dead ends in copy
- [ ] Privacy tab: extension requests `activeTab` (current page only),
      `storage` (tip history + network pref), page content for extraction.
      No analytics, no remote code, no data sale. **Privacy policy page
      required** — host at `https://nibgate.xyz/extension-privacy` first.
- [ ] Store description + 1280×800 screenshots (record the killer demo).

## Steps

1. Pay the one-time $5 Chrome Web Store developer fee (Google account).
   New accounts may face identity verification — do it immediately, it gates everything.
2. Developer Dashboard → New item → upload a zip of `dist/`.
3. Fill listing: name `Nibgate`, category Productivity/Finance,
   privacy policy URL, support email `hello@nibgate.xyz`.
4. Submit the **testnet-default** build first (honest description: testnet play
   money). Do NOT wait for approval to continue building.
5. When live, use **staged rollout** (e.g. 20% → 100%) for the mainnet-default
   flip so a bad build doesn't hit every user at once.

## Network policy

- Ship default **testnet**, mainnet behind the confirm-gated toggle.
- Flip the default only when mainnet tipping is fully live + keeper active.
- The toggle + per-network hosts mean one listing serves both networks.
