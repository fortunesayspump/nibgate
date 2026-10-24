# Chrome Web Store submission

**Status: v1.2.0 LIVE on the store** ([listing](https://chromewebstore.google.com/detail/nibgate/hbinjoadmoahedigmjaldiclmakanknf)); verified October 15, 2026.
Version 1.2.1 was submitted on October 24, 2026 and is awaiting Chrome review;
do not call 1.2.1 live until review and publication complete. The repository,
local release artifact and submitted archive are v1.2.1.
The Hub backend that accepts both the legacy 1.2.0 refund message and the
strict 1.2.1 message is deployed and health-verified on each network. The ZIP
has been submitted for Web Store review; use a staged rollout after approval.
The latest live synthetic held-tip refund succeeded on Arc testnet in transaction
`0x1c50cd491632d599b3b8772d206191f8f98e8838e16984069877fc24b7029b0f`:
the holding box ended at zero, the original payer received exactly 0.01 test
USDC, the public held-tip ledger cleared and the temporary recovery key was
deleted. This verifies that exercised testnet path, not every production path.
Rollout order remains backend first, extension second.
Sideload for dev/review continues via `LOAD_IN_CHROME.md`; never gate
building on store approval.

## Review reality (checked Sep 2026)

- **Not instant.** New developer account + new extension + payment-adjacent
  behavior = every "closer inspection" signal. Expect **days to weeks**; Google
  gives no SLA (support escalation only after 3+ weeks stuck).
- **Site access is optional, not install-time.** The extension no longer
  declares broad host permissions or a site-wide `content_scripts` entry. It
  requests `http(s)://*/*` at runtime via `optional_host_permissions` only when
  the user taps "Enable on all sites", then registers `content.js` with
  `chrome.scripting.registerContentScripts`. This keeps it off the
  "broad host permissions" in-depth-review path.
- Updates to an already-approved item review faster than first submissions.
- Never cancel + resubmit while pending — it rejoins the back of the queue.

The 1.2.0 update adds the `contextMenus` permission for an explicit **Tip this page** action on HTTP(S) pages and links. This action opens the existing approval window and preserves verified-recipient/held-owner-claim behavior. No payment is signed from the context menu itself.

## Release checklist (v1.2.1)

- [x] `npm run build` clean, `dist/` contains manifest + bundles + icons/fonts
- [x] Icons present: `icons/icon16|48|128.png` (store requires all three)
- [x] No `console.log` in `src/`; dual-network copy (testnet default, mainnet pill)
- [x] Privacy policy page source updated for all declared permissions and API
  hosts (deployment remains separate) — `frontend/src/app/extension-privacy/page.tsx`.
  Extension requests `activeTab` (current page only), `scripting` (register the
  optional content script), `storage` (vault/preferences/history and pending
  proof recovery), `alarms` and `idle` (auto-lock), `contextMenus` (page/link tip),
  `clipboardWrite` (copy an address or recovery phrase only when the user
  clicks Copy), and optional site access the user grants at runtime so the tip
  button can read page content for extraction. Clipboard contents are never
  read or sent. Host access is limited to the primary and Subblogs Nibgate API
  hosts. No analytics, no remote code, no data sale.
- [x] Store description + 1280×800 screenshots + promo tiles (see below).
- [x] Automatic injection restricted to high-confidence posts on independent
  creator sites; all social-media and Nibgate routes stay off, and SPA controls
  clean up.
- [x] Six password fields have an accessible, non-persistent visibility toggle.
- [x] Reviewed payment context is immutable and ambiguous proofs recover without
  sending a second payment.

Known limitations: production Hub deployment and the exercised Arc testnet
Circle/wallet refund path are verified. This does not prove every refund path,
and the submitted extension should still use a staged rollout after Chrome
approval. The explicit context menu can tip any HTTP(S) target by user choice.
Automatic classification cannot guarantee correctness on every custom site.
Backend whole-box claim
semantics require a future contract migration for preventive exact-balance
enforcement; this extension build does not change deployed contracts.

## Future updates

1. **Updates re-enter review** — never cancel + resubmit while pending; it rejoins the back of the queue.
2. Use **staged rollout** (e.g. 20% → 100%) for subsequent builds
   so a bad build doesn't hit every user at once.
3. Build the next version and upload it as an update to the same store item.
   Version 1.2.0 already includes **Tip this page** for HTTP(S) pages and links.

## Submission copy for 1.2.0

Single purpose:
> Tip creators and website pages with USDC. The extension shows a tip button on eligible creator pages and offers a Tip this page right-click action for HTTP(S) pages and links. Users choose an amount, review the recipient, and approve payment through a built-in self-custodial wallet. Tips settle to verified recipients or are held for the website owner to verify ownership and claim through Nibgate.

contextMenus justification:
> Adds Tip this page to the right-click menu for HTTP and HTTPS pages and links. Selecting it opens the tip window for that page or linked page, where users choose an amount, review the recipient, and explicitly approve payment. This supports tipping even when no automatic creator button appears. The menu action does not sign or send a payment.

Short description:
> Tip creators and pages with USDC. Right-click to tip, review before paying. Testnet by default; mainnet available.

Full description:
```
Nibgate lets you tip creators and website pages with USDC.

• Right-click any HTTP or HTTPS page or link and choose “Tip this page”
• On eligible creator pages, tap the floating coffee icon or the “Tip the creator” button at the end of the content; × dismisses only the floating icon
• Pick $1, $5, $10, or a custom amount, review the recipient, then approve
• Tips settle in USDC on Arc, directly or via Circle Gateway
• Unresolved recipients? Tips are held for the website owner to verify ownership and claim; unclaimed held tips can be refunded in full
• Self-custodial wallet built in: your private keys stay on your device

Starts on Arc Testnet with free faucet USDC (play money only). Switch to Mainnet using the header network pill and confirm before using real funds.

Support: hello@nibgate.xyz
Privacy: https://nibgate.xyz/extension-privacy
```

Screenshots (1280×800 composed feature frames, dark canvas + headline left +
product crop right, in `e2e/screenshots/` — regenerate raws then compose;
see `e2e/promo/frames.html` + `frames-shots.mjs`):
`store-01-home.png` (Tip every creator), `store-02-article.png` (One tap),
`store-03-review.png` (Review before signing), `store-04-activity.png`
(Held safe), `store-05-receive.png` (Get tipped back).
Promo: `promo-small-440x280.png` (required), `promo-marquee-1400x560.png`
(`node e2e/promo-shots.mjs`; brand mark + wordmark on dark).

## Network policy

- Ship default **testnet**, mainnet behind the confirm-gated toggle.
- Flip the default only when mainnet tipping is fully live + keeper active.
- The toggle + per-network hosts mean one listing serves both networks.
