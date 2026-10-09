# Nibgate Extension — tip any creator on the web with USDC

**Status: v1.0.1 submitted to the Chrome Web Store, awaiting review.**
Until approval lands, sideload `dist/` (takes a minute — see
`docs/LOAD_IN_CHROME.md`). Submission process: `docs/STORE_SUBMIT.md`.

Part of the trio: `tipping/` = protocol, `extension/` = humans, `dr-nib/` =
agents. Bots and agents never touch the extension — they use the skill.md API
route.

---

## For readers — using the extension

### Install

- **From the store** (once review clears): install Nibgate, pin it, done.
- **Right now**: sideload — build (`cd extension && npm install && npm run build`)
  and load `dist/` unpacked at `chrome://extensions`. Same code that was
  submitted.

### Your wallet (self-custodial)

On first open you **create** a wallet (a recovery phrase is shown once — write
it down) or **import** one. The wallet is encrypted on-device with your
password (PBKDF2 + AES-256-GCM); keys live in the background worker's memory
only, never in web pages. Lock it anytime from Settings → Security; reveal the
recovery phrase there too (password required).

### Networks — testnet first, mainnet behind a confirm

One build serves both networks. The header pill shows the active one
(**TESTNET** by default) with the Arc mark. Tapping it offers Mainnet behind
an explicit confirmation, so real money never happens by accident.

- **Testnet (Arc Testnet, chain 5042002):** free USDC from the Circle faucet
  (`https://faucet.circle.com`). Play money for trying everything.
- **Mainnet (Arc, chain 5042):** real USDC. Balances, history, and tips are
  per-network — switching networks switches everything you see.

### Tipping on any page

1. Open an article, tutorial, paper, or video page. (Nibgate's own sites are
   excluded — they already tip natively.)
2. A **coffee-button** appears near the content. That's the whole page UI —
   nothing about money ever renders inside the page, so pages can't spoof it.
3. Tapping it opens the Nibgate **tip window**: amount presets ($1 / $5 / $10)
   or custom, a review step showing exactly who gets paid and the fee, then
   **Approve** signs with your wallet. Nothing signs without your tap.
4. Receipt lands in **Activity**, and counts in hub Explore/ledger/earnings
   like any other tip (`type: 'tip'`).

Two outcomes, both safe:

- **Creator resolved** — the tip settles over x402 rails (direct transfer or
  Circle Gateway) at a 1% protocol fee.
- **Creator unknown** — nothing is paid blind. Your USDC waits in a
  deterministic holding box keyed to the domain (owner claims later at 5%),
  and you can **refund yourself in full, in one tap**, anytime. Holdings never
  expire.

### Money in, money out

- **Receive**: your address + QR per network.
- **Send**: plain USDC transfers with a fee estimate before you confirm.
- **Gateway Deposit / Withdraw**: move USDC between your wallet and the
  Circle Gateway balance (used by paywalls and instant unlocks).

### Privacy

No analytics, no remote code, full policy at
`https://nibgate.xyz/extension-privacy`. Site access is optional and granted
by you at runtime ("Enable on all sites") — install asks for almost nothing.

---

## For developers — building on it

### Architecture (MV3, no framework, esbuild → `dist/`)

```text
page (untrusted)            extension (trusted)
─────────────────           ──────────────────────────────────
article DOM ──► content/tip-card.ts (ONE coffee button only)
                       │  chrome.runtime messages (TIP_OPEN/GET/
                       ▼  CHALLENGE/EXECUTE/CANCEL/RESULT)
                background/service-worker.ts — keys, signing,
                  balances, gateway, hub calls (TIP_*, BALANCES,
                  GATEWAY_DEPOSIT/WITHDRAW, ESTIMATE_SEND_FEE)
                       │            ▲
                       ▼            │ chrome.storage (prefs, history)
                popup/ (wallet shell)   tip/ (amount→review→approve→receipt window)
```

Rules that are load-bearing, not stylistic:

- **Keys never touch pages.** Content scripts hold no secrets and make no
  hub calls; everything sensitive runs in the worker/popup/tip window.
- **No `confirm()`/`prompt()`/`alert()` anywhere** — native dialogs kill the
  popup context and block pages. All confirmations are inline UI or extension
  windows.
- **One build, two networks** (`src/lib/network.ts`). Testnet default;
  mainnet behind the confirm-gated header pill. A build-time
  `NIBGATE_HUB_API=...` override exists for dev/staging (no popup UI for it).
- **Money UI lives in `tip.html`, never in-page.** The card is a trigger;
  amounts, fees, and signatures happen in the extension window.

### File map (actual)

```text
extension/
  manifest.json            # MV3, v1.0.1: worker, popup, optional site access
  package.json / tsconfig  # TS + esbuild
  src/
    content/tip-card.ts    # the single coffee-button trigger + TIP_RESULT poll
    content/page-model.ts  # deterministic page map (kind/root/bounds/author/
                           #   eligibility) — every judgment a JEV decision
                           #   over scored options, no LLM, no network
    content/extract.ts     # title/author/canonical/fingerprint extraction
    content/dom-candidates.ts # DOM wallet-candidate harvesting
    content/guard.ts       # where the card may/may not render (+ bfcache guards)
    background/service-worker.ts # TIP_* protocol, signing, balances, gateway
    popup/popup.html/.ts   # wallet shell: onboard, lock, home, activity, send,
                           #   receive, deposit, withdraw, settings, detail
    tip/tip.html/.ts       # amount → review → approve → receipt window
    lib/network.ts         # networks, pill state, custom-hub override
    lib/api-client.ts      # hub surface per active network (resolve/challenge/…)
    lib/embedded-wallet.ts # vault: PBKDF2-600k + AES-256-GCM, worker memory only
    lib/gateway-pay.ts     # x402 rail helpers (mirrors @nibgate/sdk adapter)
    lib/gateway-funds.ts   # deposit/withdraw via GatewayClient
    lib/balances.ts        # wallet + gateway balance reads
    lib/crypto-shim.ts     # WebCrypto alias for node's crypto (x402 dep)
  scripts/build.mjs        # esbuild → dist/ (strips loopback hosts for prod zips)
  icons/                   # brand marks (Arc/USDC/Nibgate) + store PNG set
  fonts/                   # hub brand fonts so the popup matches nibgate.xyz
  docs/
    LOAD_IN_CHROME.md      # sideload + dev loop
    STORE_SUBMIT.md        # store process + listing (v1.0.1 submitted)
    MARKING.md             # content-marker convention (advisory, backend decides)
```

### Resolution flow (settle vs hold)

`lib/api-client.ts` `resolveContent()` per page:

1. **Hub index** — `/hub/resolve?url=` (verified records + known content).
2. **Declared page wallet** — an explicit recipient signal, routing only.
3. Otherwise **unknown/hold** — the card says funds will be held, never pays.

The backend re-extracts, re-resolves, and re-decides from the canonical URL —
page markers are advisory (see `docs/MARKING.md`).

### JEV on every page

`content/page-model.ts` drives the real JEV core (`jev/src/decide.ts`):
classify (content/feed/landing/app) → pickRoot → boundaries → pickAuthor →
eligibility gate. Each verdict carries a human-readable `reasons[]` trace
(`data-nibgate-reason` on the document element). Confidence below threshold =
hold-don't-pay, stated visibly.

### Build, dev, test

```bash
cd extension
npm install
npm run build        # → dist/ (production: loopback hosts stripped)
npm run dev          # watch mode; then ↻ the card at chrome://extensions
npm run typecheck    # tsc --noEmit
NIBGATE_HUB_API=http://localhost:3005 npm run build   # point at a local hub
```

- **E2E is local-only and never committed** (`e2e/` is gitignored): content-script
  runs, funded testnet tip runs (direct settle, gateway hold, claim release,
  refund, insufficient-funds), and wallet-connect runs. A keeper wallet funds
  the funded paths — top up at the Circle faucet when it runs dry.
- **Store zip**: `Compress-Archive -Path dist/* -DestinationPath
  nibgate-<version>.zip` after a clean build; keep the manifest version and
  the zip name in lockstep (see `docs/STORE_SUBMIT.md`).

### Store & review notes (for the curious)

The extension declares almost nothing at install (`activeTab`, `storage`);
site access is requested at runtime via `optional_host_permissions` only when
the user enables the tip button — this keeps it off the broad-host-permissions
in-depth-review path. Full rationale in `docs/STORE_SUBMIT.md`.
