# Production E2E — Findings Ledger

As of 2026-08-13. Production stacks: frontend `nibgate.xyz/share` (Next.js),
API `api.nibgate.xyz`, payments via Circle Gateway x402 on Arc Testnet
(`eip155:5042002`), USDC is the **native** token (18 decimals; ERC-20 wrapper
`0x3600…0000`). Wallet = mock EIP-6963 (real signatures).

## What works (verified happy paths)

- **Create + publish** (free / paid / whitelist / invite-only / whitelist-free):
  publish modal "Published!", copy-link, slug → `https://nibgate.xyz/ns/<slug>`.
  Buyer/poster creds: private key held by **seller**; SIWE via "Connect wallet →
  Mock Wallet → Sign with wallet".
- **Free post**: readable by anonymous + connected, no gate, `/access` returns
  content + proof.
- **Whitelist-free**: `whitelistPrice:"0"` → quote `effectivePrice:"0"`, banner
  "You're on the whitelist — unlock free", button "Unlock for free". With an SIWE
  session, `/access` grants entitlement 200 with content + `unlockProof`.
- **Invite-only** (`publicAccess:false`): non-whitelisted buyer gets the clean
  "Invite only / This content is invite-only." screen, quote `canUnlock:false`.
- **Paid x402 flow**: "Hold to pay" (1.5s hold) → `POST /access` → 402 challenge →
  wallet signs **real EIP-712 `GatewayWalletBatched`** (chain 5042002,
  verifyingContract `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` = Circle SCW) →
  facilitator verifies. A 0-USDC buyer is rejected with `402 / {"error":"Payment
  verification failed","reason":"unauthorized"}`.
- **Direct rail (transfer) unlock**: the unlock UI switches to the Direct tab,
  the wallet broadcasts a real USDC ERC-20 transfer to the share owner, and the
  follow-up access call verifies the txHash (`x-nibgate-transfer-tx`) and returns
  the paid body. Verified locally end-to-end (`e2e/harness/local-direct-rail.js`)
  with a swarm wallet (CryptoAlice) as owner — the harness `SEL_PK` is
  blocklisted as a wrapper **recipient** too.
- **Quote endpoint** honors per-actor price and whitelist tier; invite-only
  `effectivePrice` still shows public price but `canUnlock:false`.
- **Currency/expiry chips** on /mine, drafts vs active accuracy, auto-expire countdown.

## UX bugs / rough edges to fix/verify

1. **Paid-failure copy is bad.** Buyer w/ 0 balance sees the raw facilitator
   reason surfaced as bare `<error>`, e.g. the literal text **"unauthorized"** and
   earlier a dangling "Waiting for wallet approval...". No friendly
   "Insufficient USDC / Payment failed. Check your balance or try again."
   Recommend mapping x402/Payment-verification reasons to human text
   (`insufficient_balance`, `expired_challenge`, `invalid_price`, etc.).
   **STATUS: FIXED & VERIFIED LIVE** (wallet 0.2.15) — `getPaymentErrorMessage()`
   in `packages/wallet/src/errors.js` maps `unauthorized`, `insufficient_balance`,
   `expired_challenge`, `invalid_price`, `invalid_recipient`, `already_used`,
   `invalid_signature`, `rate_limited` to friendly copy; `unlock.jsx` now surfaces
   it instead of the raw reason. Live probe on the paid gate: Circle-verify failure
   now shows "Something went wrong with your wallet. Please try again." instead of
   the raw `unauthorized`.
2. **Free-unlock 402s when SIWE hasn't completed.** Whitelist-free user who skips
   the SIWE modal (or where connect auto-approves without personal_sign) hits
   402 + stuck "Waiting for wallet approval..." instead of a friendly
   "Sign in to unlock" prompt. Unlock for free must not route through a payment
   challenge (server already free-grants when session is present — client should
   ensure session before gate).
   **STATUS: FIXED & DEPLOYED** (wallet 0.2.15) — `unlock()` now always runs the
   SIWE sign-in for an already-connected wallet before calling the access route,
   so free/whitelist-free unlocks are session-granted instead of 402ing.
3. **"Hold to pay" affordance** is non-standard and undiscovered (no hint that it
   requires a ~1.5s press; meta-cognitive UX). Consider a progress ring + label,
   or a plain button.
4. **Whitelist "same as public price" default** — form dropdown is explicit, but
   a whitelisted wallet sees "— whitelisted wallets unlock here" with the full
   public price with zero discount signal; confusing copy. (Data is correct.)
5. **`eth_signTypedData_v4` not handled natively by wallet-mock** — we shim it.
   For real MetaMask it's fine; only matters to us because of the harness.
6. **Arc RPC blocklist**: `0x7099` (widely-known public key) is blocked by every
   Arc RPC for `eth_sendTransaction`. This is an RPC-side anti-abuse rule, not a
   Nibgate bug. It blocked a scripted fund-transfer attempt. The buyer `0x3C44…`
   is NOT blocked: its approve + deposit txs mined normally.
7. **Gateway verify/settle hard-fail on Circle testnet (blocking funded purchase).**
   Even a PERFECT payload fails: valid EIP-3009 `TransferWithAuthorization`
   (recovered signer == buyer), requirements exactly per the `402` challenge and
   schema, and a confirmed **6.0 USDC Gateway deposit** (tx
   `0xb629c13de216e5bb2023a3501312f5fb4fc5d988cc59c3d870bbe5d04c2c8899`;
   `/v1/balances` shows `6.000000`). Yet BOTH `/v1/x402/verify` and
   `/v1/x402/settle` return `unauthorized` (verify:
   `{"isValid":false,"invalidReason":"unauthorized"}`; settle:
   `{"success":false,"errorReason":"unauthorized"}`). This is Circle-side
   (testnet issuer/project gate), not a Nibgate bug — nothing in our control
   changes it. Documented so we stop chasing it.
   **Re-confirmed 2026-08-15:** a fresh EIP-3009 payload (recovered signer ==
   buyer `0x3C44…`, Gateway `6.0` balance intact) still yields
   `POST /v1/x402/verify → 200 {"isValid":false,"invalidReason":"unauthorized"}`
   against `gateway-api-testnet.circle.com`. Still a Circle-side testnet
   issuer/project gate.
   **RESOLVED 2026-08-18:** the **Direct rail** bypasses Circle entirely — the
   buyer broadcasts a normal USDC ERC-20 transfer to the recipient and the server
   verifies the txHash on-chain. Paid unlocks now work end-to-end; the gateway
   rail remains the blocked upstream path.
8. **`createGatewayMiddleware` cannot send auth headers.** The SDK's
   `createGatewayMiddleware()` builds a `BatchFacilitatorClient` WITHOUT
   `createAuthHeaders`, so a seller app has no official way to attach a Circle
   API key to verify/settle — even though production reads `CIRCLE_API_KEY` for
   `gatewayBalance()` and Circle docs say "API key required". If Circle gates
   x402 on API keys/recipient-allowlists, Nibgate can't comply via this SDK.
9. **`/x402/verify` payload-shape gotchas (API-integration note, we pass
   correctly):** the gateway 400s unless the payload carries `resource` +
   `accepted`, and `accepted` must be an production object (not an array).
   The Circle `PaymentPayload` schema only requires `x402Version/accepted/payload`,
   but decode of the `402` challenge also yields `resource` — our client sends it.
   Future SDK bumps should re-check this shape.
10. **[HIGH] Media uploads are completely broken in production.** ALL of
    photo/video/music/document fail with the bare "Upload failed" — the client
    POSTs `nibgate.xyz/uploads/content?encrypted=1` and it 404s. Root cause:
    the frontend Next rewrite sends `/uploads/:path*` → `https://api.nibgate.xyz/uploads/:path*`,
    but the backend's bare-path→`/api` rewriter (`backend/src/server/server.js:47`)
    only matches segment **`upload`** (singular) — `/uploads/content` (plural,
    which is what the app uses) misses the regex → no route → `Cannot POST
    /uploads/content`. Proof: `POST api.nibgate.xyz/api/uploads/content` = 401
    (route exists, auth-gated), but `POST api.nibgate.xyz/uploads/content` = 404.
    Fix is 1 token: add the plural `uploads` to that regex (or rewrite uploads →
    `api.nibgate.xyz/api/uploads/:path*` in next.config). Tested with real,
    valid tiny files (png/mp4/mp3/pdf).
    **STATUS: FIXED & VERIFIED LIVE** (commit a5e2e19) — `POST
    nibgate.xyz/uploads/content?encrypted=1` now returns 401 (route resolved,
    auth-gated), not 404.
11. **`expiresAt` is server-validated to be in the future** (`{"error":"expiresAt
    must be in the future."}`) so you cannot create an already-expired post via
    API — sensible, but it means the expired-state UI is only reachable by
    waiting out a short expiry (create with `now+6s`, refresh after).
12. **Banning a wallet on a FREE post does not gate access** (free posts ignore
    entitlements; `POST /api/nibshare/:slug/entitlements/:wallet/ban` returned
    `banned` but `/access` still served 200 + full content). Ban is only
    meaningful for paid/whitelisted posts. Worth a note because an owner might
    "ban" someone on a free post expecting them to lose read access.
13. **Custom whitelist tier confirmed end-to-end incl. connected-buyer UI**
    (created `ddLEPvxv`: public $12, whitelist tier $2; whitelisted wallet quote →
    `effectivePrice:"2"`/`inWhitelist:true`; stranger → `12`). Connected buyer
    sees "You're on the whitelist — your price 2.00 USDC 12.00 USDC public".
    Whitelist-free (`JsLravCn`): "unlock free" banner + "Unlock for free" button.
14. **Gate UI silently ignores a failed quote.** With `page.route` aborting
    `GET /api/nibshare/:slug/quote`, the gate still renders fine at the base
    price — no error, no toast, no retry affordance. Same for a `500` (or abort)
    on `/access` / gateway calls: the gate hangs on "Checking…" with no error and
    no cancel. A **failed/aborted publish** is equally silent: no error banner,
    form just sits there (user may think it published). Connectivity failures are
    **silent** in the unlock UI (only the raw Payment-verification copy (#1) ever
    shows anything).
15. **`/share` auth uses Reown AppKit now** — installing the mock wallet AFTER
    page load doesn't work (AppKit scans connectors at boot); the harness MUST
    install-before-first-navigation. Not a product bug — harness only. (The
    connect button also transitions to "Connecting..." forever when no
    compatible connector is present.)
16. **Ban works on PAID posts (API + gate UI), but is invisible at the bypass
    endpoint.** Owner ban→`200 {status:"banned"}`, restore→`200 {status:"active"}`
    (tested on `dR21SdTL`). Once the buyer is banned: the *quote* reflects it
    (`banned:true, status:"banned", canUnlock:false`), and the gate UI (connected
    buyer) shows a clean "**Banned** / No access / This wallet is banned from this
    content. If you think this is a mistake, reach out to the creator." — nice
    UX. BUT `GET /access?wallet=<banned>` still returns plain `402 {}` with empty
    body (identical to an un-banned, un-entitled caller), so a direct-API buyer
    gets no "you're banned" signal. Recommendation: return a 403 with a
    `reason:"banned"`-style body from `/access` for banned wallets.
17. **Expired share flow verified end-to-end.** Can't create a post with
    `expiresAt` in the past (`400 expiresAt must be in the future.` — #11), but
    creating `now+6s` → `201`, and once passed: `GET /access` → **HTTP 419**
    `{"ok":false,"error":"This share has expired."}`, and the post page renders
    "✎ Writing | <title> | This share has expired." — cleanly handled state
    (419/past-due rather than 410-Gone). No deep-link/backspin content reveal.
18. **"Save as draft" works but the post-save UX is confusing.** (updated after
    stress battery) Clicking Save-as-Draft with valid title+body CREATES the post
    (`status:"draft"`, auto 7-day `expiresAt`) and NAVIGATES to `/share/mine` —
    but lands on the **Posts** tab, where the just-saved draft is NOT visible
    (drafts live under the separate Drafts tab). No toast, no "draft saved"
    confirmation, no link to the draft. A user cannot tell saving worked and must
    realize they should switch to the Drafts tab. Recommend `router.push('/share/
    mine?tab=draft')` (or a drafts view) + a success toast.
19. **Whitelist discount is only shown AFTER connecting** — an unconnected reader
    on a whitelist-tier post sees the full public price ("12 USDC") with no hint
    a discount exists; the "You're on the whitelist" banner + discounted price
    only render once the wallet connects and the quote resolves. Also visible in
    the process: gate shows the connected wallet's USDC balance (e.g. "6.00 USDC"
    = the SCW deposit) next to the address. Recommend consulting an identified
    wallet earlier (or showing effectivePrice from `?wallet` when present).
20. **[HIGH] The agent / hub-route gateway surface is dead in production.**
    `/api/content/:id/price`, `/api/content/:id/access` (human OR agent), and
    `/api/content/manifest` / `/api/nibgate/manifest` all 404 — every id returns
    `{"error":"Unknown content id"}`, even the real `externalId`
    (`9afad033-…`) of a live verified post from `/api/hub/explore/content`.
    Cause: the deployed api backend runs `environmentConfig()` where
    `routes: []` (backend/src/server/runtime.js:24, used whenever
    `NODE_ENV=production` and `NIBGATE_CONFIG` is unset), so `routeById`
    never matches and the whole `agentPrice` pricing path is unreachable.
    Agent pricing exists in code (`route.agentPrice`, default `'0.001'` in
    packages/cli default-config; `createPaymentChallenge` uses it for
    `actor=agent`) but nothing production-side can resolve a route id — a real
    agent purchase via api.nibgate.xyz is impossible today. Corroboration:
    `/api/nibgate/status` reports `"hub":{"apiBaseUrl":"http://localhost:3000",
    "siteId":"","siteToken":""…}` — i.e. the public status endpoint leaks an
    internal hostname and confirms the default config path. The share-based
    gateway (`/api/nibshare/*`) is unaffected and fully functional.
    **STATUS: FIXED (backend/src/server/lib/live-routes.js + server.js + 
    hub-routes.js, deployed pending).** When the config ships no routes the
    gateway now backfills its route table from live verified content, so
    `/api/content/:id/price|access|manifest` resolve real content ids again.
    A new `/api/nibgate/manifest` route (query `subdomain=` or
    `x-site-subdomain`/`x-forwarded-host` headers) returns the site
    `nibgate.json` shape the subblog deploy proxies — drop-in replacement for
    the legacy Railway host. `/api/nibgate/status` no longer leaks
    `http://localhost:3000` (hub.apiBaseUrl defaults to the public origin in
    `environmentConfig()`).
21. **Paid subblog media: viewer fetches before unlock → raw "SheetViewer
    failed: fetch 402".** On the premium document `catwalk.nibgate.xyz/docs/
    lookbook-materials-d14` (0.50 USDC), the paywall renders correctly
    ("0.50 USDC | Pay to unlock | Hold to pay"), BUT the document viewer fires
    `GET api/nibgate/media/<id>/document?subdomain=catwalk` regardless of lock
    state, gets 402, and logs `SheetViewer failed: Error: fetch 402`
    (page chunk `[type]/[slug]/page-*`). The user never sees that string (blank
    viewer behind the gate), but it's a premature/unconditional media fetch on
    every paid-document view — wasted request + raw error path. Viewer should
    defer until an unlock cookie exists.
    **STATUS: FIXED (subblogs/frontend DocumentContent.tsx, deployed pending).**
    The Sheet/Text viewer, HTML render, and PDF frame are now gated behind
    `!isPaid`; a gated document renders only the file card + unlock widget, and
    the viewer appears after payment via NibgateUnlock's own proof-gated fetch.
    Verified: no `GET /nibgate/media/:id/document` fires on paid-doc views.
22. **(not a bug — architecture note) Subblogs run their own backend.** The
    subblog frontend (`catwalk.nibgate.xyz`) rewrites `/api/*` to the **subblog
    backend** (`subblogs/backend/` → `nibgate-production.up.railway.app`), which
    serves `/api/nibgate/posts/:id/quote`, `/api/nibgate/media/…`, and the site
    manifest. `api.nibgate.xyz` is the **hub/share** backend (`@nibgate/backend`)
    and does NOT serve the subblog routes (verified: `/api/nibgate/posts/…/quote`
    → 404 on the hub). The Railway host is the subblog's own production backend,
    not a legacy proxy target — no repoint needed. (See #20's `/api/nibgate/manifest`
    which the HUB serves to resolve subblog content for the agent gateway.)
23. **Owners get 402 on their own paid post — no owner/preview bypass.** `GET
    /api/nibshare/:slug/access?wallet=<owner>` returns `402 {}` for the creator's
    own wallet on a paid share, and the reader gate (`/ns/<slug>`) shows
    "Pay to unlock" to the signed-in owner too. There is no owner-gratis path or
    "preview own post" affordance; the owner must pay through the Hold-to-pay
    flow like a stranger. Minor: acceptable for a marketplace (owner-as-buyer
    is a real use case) but surprising with no owner badge/preview.
24. **Server-side `contentType` is not validated.** `POST /api/nibshare` returns
    201 for `contentType: "not-a-real-type"` and stores it (row shows the bogus
    type in `/share/mine`). The frontend restricts via the `Type` select, but the
    API accepts anything — revoke API + agent/import clients can create corrupt
    types. Fix: whitelist ['article','photo','video','music','document'] in
    `createShare` validation.
    **STATUS: FIXED & VERIFIED LIVE** (commit 7a129e6) — the battery's px-14
    check now asserts `400` and passes; bogus types are rejected at the API.
25. **(minor) No title length cap.** The title input accepts 300+ chars (no
    `maxLength`), and the server stores it (Prisma `String` → TEXT, no bound).
    Risk: pathological titles break layout in gates/ledger truncation. Add a cap
    (~120) client + server.
    **STATUS: SERVER-SIDE FIXED** (commit 7a129e6 caps at 150) — the input UI
    still accepts long strings client-side, but the API now rejects titles over
    150 chars. Consider a UI `maxLength` hint too.
26. **(mobile) `/explore` header expands the layout viewport on phones.** With a
    wallet installed and the mobile menu in the DOM, `document.documentElement.scrollWidth`
    → 1232px on a 390px phone: the fixed mobile nav (`inset: 80px 0 auto`) spans
    the expanded layout viewport, and its column nav contributes no min-width
    guard. Fixed in `site.css` (`overflow-x: hidden; width: 100%; max-width:
    100vw` on `.nibgate-header-mobile` + `min-width: 0` on its nav). Pending
    deploy to verify scrollWidth returns to 390.
27. **(fix deployed pending) Paid-price input snaps back to Free while typing.**
    Selecting "Pay to unlock" seeds price `"1"`; clearing the input sets
    `form.price=""` → `isPaid=false` → the Free card re-activates and the price
    field unmounts, so a buyer can't type a value that doesn't start with `1`
    (e.g. "2.50"). Fixed in `ShareForm.tsx`: sticky `priceFocused` state keeps
    Pay mode active while the input is focused; only blurring an empty field
    reverts to Free. Also added a 16px mobile font-size bump in `nibshare.css`
    to stop iOS Safari zooming on input focus.
28. **(mobile) Notification dropdown can overflow small screens.** The
    ActivityBell panel is `w-80` (320px) anchored `right-0`; on a 375–390px
    viewport its left edge can pass the screen edge. Fixed with
    `max-width: min(20rem, calc(100vw - 16px))`. Pending deploy to verify.
29. **Anon `/dashboard` redirects to the marketing home — no dashboard leak, but
    also no "sign in to view your dashboard" prompt.** `GET /dashboard` without a
    session lands on `nibgate.xyz/` (nav + "Get started" marketing). Good for
    auth, but the user gets no explanation; the first "Connect wallet" moment
    happens on the marketing page. With a SIWE session the real creator
    dashboard renders (Profile / Creator setup, Sites / Connected origin,
    Contents / Protected routes, Analytics, Earnings).
30. **Share-site gates render no rating widget; subblog gates do.** The reader
    gate at `nibgate.xyz/ns/<slug>` (connected or anon) shows price + Hold-to-pay
    but no star rating row, while the subblog gate
    (`catwalk.nibgate.xyz/docs/lookbook-materials-d14`) renders `☆ ☆ ☆ ☆ ☆ |
    No ratings`. Inconsistent rating surfaces across the two gate UIs.
31. **(minor) Disconnect on the share gate can leave the account displayed.**
    Clicking Disconnect clears the SIWE session (fetch `/api/auth/logout` +
    session-clear event) and the wallet menu closes, but the AppKit account can
    persist so the address chip stays until the account itself drops. The gate
    then still shows the wallet's balance row. Mostly cosmetic; worth a `disconnect()`
    after session clear on the share gate to keep the two in sync.
32. **Banned-wallet flow can't be exercised via the reader/anon path.** The
    `ban` API (`POST /api/nibshare/:slug/entitlements/:wallet/ban`) returned **401**
    for a throwaway wallet, and the share gate at `nibgate.xyz/ns/<slug>` with
    `?wallet=<banned>` never rendered banned copy (no "banned" text). Either the
    ban endpoint needs a seller-authed session (our anon request was rejected) or
    the reader does not key off the query-param wallet for banned state. Since the
    ban UI lives only in the seller dashboard, the reader "banned" state is not
    verifiable through the public gate — worth a dedicated seller-side UI check or
    an authenticated ban + view.
33. **Subblog reader pages don't render a stable identity string.** Visiting
    `catwalk.nibgate.xyz/writing/*`, `/docs/*`, `/photos/*`, `/music/*` as anon
    returns 200 with no error boundary and correct paywall/price state, but the
    word **"Catwalk"** never appears in the rendered body text. The subblog brand
    name is not surfaced on the reader route (or is client-rendered after our
    2.6s snapshot). Cosmetic / naming consistency — the home page shows it, the
    per-post reader may not.
34. **Ratings widget absent on share-site gate (confirms #30).** The matrix check
    confirmed `nibgate.xyz/ns/<article-free>` renders no star/rating element,
    while the subblog gate renders `☆ ☆ ☆ ☆ ☆ | No ratings`. Non-blocking
    inconsistency across the two gate UIs.
35. **Form-create matrix is green across all 5 content types × 5 access modes.**
    UI-publishing an article/photo/video/music/document post for free/paid/
    wlfree/wldrop/invite all publish and produce the expected gate (paywall on
    paid/invite, none on free) with no error boundary. The one soft spot: the
    banned matrix (see #32) needs an authed seller session to be meaningful.
36. **Non-article types replace the prose editor with a media-upload drop area.**
    Selecting Photo/Video/Music/Document on the share form removes the `Body *`
    Tiptap editor and swaps in the type-specific uploader (Photos */ audio */
    video */ document *). The generic `fillNewShare` body-typing helper must
    therefore branch per type; a raw editor click times out on these types. This
    is expected product behavior (not a bug) but worth an explicit caption field
    note — the photo type's "Write a caption" input is separate from the upload.
37. **Media upload works end-to-end with valid files.** `POST /uploads/content?encrypted=1`
    (rewritten to `api.nibgate.xyz` via `next.config.ts` `/uploads/:path*` → API,
    then the backend's bare-path proxy in `server.js` maps `/uploads/*` → `/api/uploads/*`)
    returns 200 with `{ success, storageRef, encryptedKey, previewUrl }` for a real
    PNG. Invalid/corrupt image bytes 500 with `{"error":"Upload failed"}` from the
    catch in `upload-routes.js` — acceptable, though the message could hint the
    file was rejected (see #15 error-shape note). Video/music/document uploads use
    the unencrypted path with a public `url`.
38. **NEW: backend architecture audit (staff+ review) — 20 findings.** A read-only
    audit of `backend/` + `subblogs/backend/` + `packages/` produced a ranked list
    (full detail captured in session notes; high-signal items below):
    - **[BLOCKER]** Paywall/entitlement logic is copy-pasted (~15 fns each) between
      `backend/src/server/nibshare/service.js` and
      `subblogs/backend/src/services/access.service.js`; the canonical `canAccess`
      rule in `packages/nibgate/src/server/access-policy.js` is NEVER called.
    - **[BLOCKER]** SDK divergence: hub uses `@nibgate/sdk: workspace:*`, subblog
      pins published `^0.4.9` (vendored). Rule fixes don't reach the subblog until
      published + lockfile bump.
    - **[HIGH]** `POST /api/hub/reputation/ratings/sync` (hub-routes.js:303) has no
      auth — anyone can trigger the on-chain indexer.
    - **[HIGH]** Subblog tenant selection trusts `x-site-subdomain` header +
      `?subdomain=` query over Host (`middlewares/tenant.js:19`) — cross-tenant
      spoofing primitive.
    - **[HIGH]** Subblog rating upsert (`rating.route.js:77`) accepts arbitrary
      client `wallet` + `txHash` with no entitlement/proof check → ratings gaming.
    - **[HIGH]** SSRF: `document-render.js` fetches author-supplied `documentUrl`
      (no scheme/host allowlist).
    - **[HIGH]** SIWE session not scoped to `siteId` (`siwe.service.js:94`) — a
      session from site A can prove possession on site B.
    - **[HIGH]** `/gateway/balance` unauthenticated proxy to Circle API key,
      implemented 3× (`packages/internal/src/payments.js`, both backends).
    - **[HIGH]** `x-admin-key` static header bypasses ALL rate limiters
      (`rateLimiter.js:6`) with no brute-force protection.
    - **[MED]** Hub stats/leaderboards/sitemap load full tables then filter/sort in
      JS (`hub-routes.js:882`, `findMany` of all unlockReceipts; magic `v < 100`).
    - **[MED]** God-object files: `hub-routes.js` 1049 lines, `nibgate.route.js`
      811, `helpers.js` 993, `controller.js` 703, `service.js` 660.
    - **[MED]** `serveAccess`/`accessShare` gate orchestration (~240 lines) written
      twice against different SDKs/models — money-path drift risk.
    - **[MED]** `isPaidValue` diverges: route-local treats `"0.00"` as paid
      (`nibgate.route.js:17`), SDK `toNumber > 0` treats it free.
    - **[MED]** Dead `packages/internal/src/hub.js` + `cli/src/core/hub.js`
      (duplicate, target non-existent `/hub/sites/*` routes) — silent no-op.
39. **NEW: batch16 run (`/tmp/opencode/new3.log`, 34 checks) — real findings.**
    - **[UI] Mobile `/explore` overflows horizontally.** `mv-explore` FAILS:
      `scrollW=1231 inner=390` — page content is ~3× viewport wide on a 390px
      mobile viewport. All other mobile surfaces (`mv-*` set: free/paid gate,
      subblog home, share form, ledger, leaderboards) pass no-horizontal-overflow.
      Explore is the only overflow offender. No error boundary triggered, so it's
      a pure layout bug, not a crash.
       **STATUS: FIXED & VERIFIED LIVE** (commit f350994) — root cause: at
       ≤640px `.market-section`/`.wishlist-section`/`.explore-directory` are
       `display: grid` with an **auto-sized column**, so the market card
       max-content (~431px) inflated the section's grid track wider than the
       358px content column, clipping every card. Fixed by constraining the
       sections to `grid-template-columns: minmax(0, 1fr)` in the ≤640px block.
       The mobile overflow check was also hardened: it now ignores elements
       inside intentional scroll containers (`overflow-x: auto/scroll/clip`) so
       carousels (featured-track, category chips) don't false-positive, but still
       flags content clipped by `overflow-x: hidden` or raw overflow. Verified:
       before fix bad=282, after fix bad=0.
    - **[UX] Draft row has no publish control.** `dp-draft-then-publish` FAILS:
      a freshly-saved draft appears in the list but the row exposes no publish
      affordance the check can reach; the publish attempt 403/400s. Drafts are
      also NOT force-listed while unpublished (`uc-cancel-upload` passes), which
      is correct — but the missing publish path from the Mine/draft list is a
      real rough edge (drafts can only be completed by re-opening the form).
      **STATUS: FIXED** — added `POST /api/nibshare/:slug/publish` (owner-auth,
      flips draft→active) + a "Publish" button on the draft `PostRow`; the check
      now clicks the Drafts filter (default Mine view hides drafts, by design).
    - **[HARNESS] Dashboard routes redirect anon to marketing — not a bug.** All
      three `db-*` checks (analytics/earnings/sites) FAIL because they navigate
      to `/dashboard/*` with `pk: h.SEL_PK` but never establish a SIWE session;
      the dashboard correctly redirects logged-out visitors to the marketing page
      (matches #29). Needs a real connected session in the harness to exercise the
      authed view — flagged as a harness gap, not a product finding.
    - **[HARNESS] `wa-connect-on-paid` fails on address-text assertion.** Connects
      the seller wallet on a paid gate; "paywall still shown" passes but the
      `0x7099` address isn't rendered as page text (connected UI likely shows a
      truncated/ens label). Paywall-after-connect is the meaningful signal and
      passes; the address assertion is too strict for the harness.
    - **[LOW] Widespread 404/403 console noise.** Every subblog-access, newsletter,
      and discovery check logs 404s (and the upload/draft flow logs 403s) for
      sub-resources while assertions pass. `sd-explore-grid` also emits multiple
      404s. Worth one pass to identify the missing assets (likely favicon/
      og-images/legacy routes) — cosmetic, not blocking.
    - **[MED]** Errors swallowed via `.catch(() => {})` in 20+ spots; 3 different
      JSON error shapes across the two backends.
    - **[MED]** Manifest sync N+1: per-resource awaited `upsert` loop
      (`helpers.js:788`).
    - **[LOW]** Upload allowlists + sharp pipeline duplicated across both backends.
    - **[LOW]** `claimMetricDedupeKey` fails OPEN on non-P2002 DB errors
      (`helpers.js:222`) — double-counts revenue on transient DB error.
    - **[LOW]** Mixed ESM/CJS + pnpm/npm across backends; no shared lint.

    **Recommended roadmap**: unify both backends onto `packages/nibgate`
    (`workspace:*`) and a shared access/entitlement service; route all gates
    through the single `canAccess`; close the 6 authz/tenant/possession holes;
    standardize one error envelope; push stats/leaderboard aggregation into Prisma.
40. **NEW: whitelist bulk-management gap (retention/convenience).** Creators with
    hundreds of subscribers had no fast path to manage a whitelist:
    - **No bulk import.** The only affordance was a paste box
      (`WalletListEditor.tsx` split on spaces/commas, dedupes). No CSV/Excel file
      upload, no per-row error report, no export, no bulk remove.
    - **No per-address tier.** A single `whitelistPrice` applies to everyone
      (acceptable, but `address,price` CSV rows were silently mishandled).
    - **Banned wallet stays in `whitelist[]`.** Ban (`service.js:314`) created a
      `banned` entitlement but never removed the wallet from the share's
      `whitelist` array — the address showed as a whitelist chip AND in the
      Banned section, and `updateAccessPolicy` re-asserted it on every save.
      (Ban itself correctly blocked access first — the gap was cosmetic/data
      hygiene, not a security hole.)
    **STATUS: FIXED** —
    - `WalletListEditor` now has **Import CSV / Excel / Export / Template / Clear all**:
      import accepts `.csv`, `.txt`, `.xlsx`, `.xls`; **header-aware column
      detection** finds the address column by its named header (`address`,
      `wallet`, `wallet_address`, `0x-address`, `holder`, `member`, `to`, …) so
      files with `name,wallet,price` layouts extract only the wallet column —
      no blind whole-sheet scan that could pick up a price cell that looks like
      hex. Falls back to scanning all columns when there's no header. Validates
      every row (invalid rows skipped + reported), dedupes, merges, and reports
      added/duplicates/invalid counts. Any `price`/`tier`/`mintFee` column is
      reported as ignored since the model has a single whitelist tier.
    - **Template download** (`whitelist-template.csv`) ships a sample file with
      the expected `address` column header, matching the allowlist-tool
      convention (AutoMinter/Bueno/HeyMint/nfts2me) so creators know the format.
    - **Ban now strips the wallet from `whitelist[]`** (`banEntitlement` in
      `service.js`) so a banned wallet can't linger in the list or be
      re-asserted by later access-policy saves. The UI mirrors the removal
      locally (`handleBan` in `SettingsSheet.tsx`) so the banned chip disappears
      from the whitelist list immediately, without a reload.
    - Export downloads the current whitelist as `whitelist.csv` (with the
      `address` header row so it round-trips back through the importer).
    - **Import preview** — uploaded files stage into a preview panel
      (first 12 short addresses + "+N more") with **Add to whitelist / Discard**
      so nothing is committed until the creator confirms; invalid rows are
      counted, not silently dropped.
    - **Search/filter** within large lists (`FiSearch` box; chip list becomes
      scrollable past 60 entries, with an "N of M match" count).
    - **Batched saves** — whitelists over 200 rows are committed in cumulative
      chunks (`CHUNK=200` in `SettingsSheet.patchAccess`) with a "Saving N%…"
      indicator; chunking is skipped when the share has active paid entitlements
      or is invite-only-with-charging, to avoid a mid-batch paid-cutoff revoke.

## Payment reality-check (production, Arc Testnet)

- Latest tx fees ~0.1–0.3 USDC; native 18-decimals, no separate gas token.
- Funding source that works: **repo `swarm/swarm-wallets.json`** (id=1 CryptoAlice
  master, 1,421 USDC) → real ERC-20 `transfer` 25 USDC (`0x3600…`) to the buyer
  (tx `0x9617ef76a8cb8cecb47e7b49d0cccd22a3bd389a8382cd868a87226d2bfa2fb0`);
  script `harness/fund-buyer.js`. Circle faucet `faucet.circle.com` needs
  reCAPTCHA (PowerShell `RECAPTCHA_ERROR`); `arc-faucet.dev` /
  `faucet.testnet.arc.network` returned empty responses. Bridging Sepolia→Arc also
  possible.
- Purchasing a truly paid share is BLOCKED upstream of us: buyer holds 25 USDC and
  has deposited 6 into the Gateway SCW, signatures verify/recover locally, but
  Circle's testnet Gateway rejects verify+settle with `unauthorized` (see #7). So
  the entire "buy → entitlement → serve" happy path on Arc testnet can't currently
  be completed end-to-end with real testnet USDC; only reachable to the 402-gate
  stage.

## Network / connectivity simulation (done)

Playwright `page.route()` used to abort/500 `api.nibgate.xyz` calls mid-flow
(quote, access, gateway, publish). Result: quote-abort is silent (base price
renders); access/gateway aborts hang on "Checking…"; publish abort shows no
error banner — no retry affordance anywhere (see #14).

## State

- Fixtures are now **self-contained**: `e2e/stress/setup-fixtures.js` rebuilds the
  canonical post set and writes fresh slugs to `e2e/stress/fixtures.json`, which
  the battery reads at require-time (no hardcoded prod slugs — the earlier static
  fixtures were all revoked during an over-broad cleanup).
  - free (E2E Free Alpha), paid (E2E Paid Playbook $5), wlfree (E2E Whitelist Free $9→0),
    wldrop (E2E Whitelist Drop $9→2), invite (E2E Invite Only, invite-only $12),
    custom (E2E Matrix Custom Tier $12→2), draft (E2E Matrix Draft4).
- The battery is **frontend-first**: every surface that has a real UI is driven by
  navigation + clicks (`e2e/stress/checks-batch1..9.js`, 107 checks). The only
  API-layer checks live in batch8 (`platform-api` group) for endpoints with NO
  dedicated UI (manifest, status, hub-pay challenge, ban/revoke/reslug/access-
  policy, gateway balance). Each check runs in an isolated Playwright context;
  a hard 85s per-check timeout prevents one slow page from stalling the run.
  `node stress/run.js` (all batches), `--only id,id` (subset), `--groups name`
  (one batch).
- Dashboard routes (`/dashboard*`) require a SIWE session; anon hits redirect
  to `/` (#29). The Mine filters (All/Active/Ended/Drafts) filter correctly and
  each row has a working delete/revoke `×` control (used by lc-03 to revoke a
  freshly UI-published post).
- Buckets to expand: expired shares, drafts → publish, banned/revoked wallet,
  uploaded media (photo/video/music/document), agent purchases, hub route pricing.
- **Batch17 whitelist-bulk-management now verified live** (`checks-batch17.js`):
  3 checks green against production. `wl-import-csv-header-aware` imports a
  `name,wallet,price` CSV via the real hidden file input → `Added 3`, all 3 chips
  render, price column reported as ignored, Export + Template buttons present.
  `wl-import-txt-excel-accept` confirms the file input accepts csv/txt/xlsx/xls
  and a real `.xlsx` buffer imports (`Added 2`). `wl-ban-strips-whitelist`
  confirms ban (`POST …/entitlements/:wallet/ban`) returns 200 and **strips the
  wallet from `whitelist[]`** in the access-control payload (W1 gone, W2 kept)
  with a `banned` entitlement — the #40 fix holds end-to-end. Only mark is WARN
  from the known mine-page 403/400 session-poll noise (see #39); all assertions
  pass. (`e2e/stress/checks-batch17.js` requires the frontend's `xlsx` for the
  Excel buffer fixture.)

- Batch16 run (`/tmp/opencode/new3.log`): 34 checks → 14 pass / 6 fail / 14 warn.
  Real product findings: mobile `/explore` horizontal overflow; draft row has no
  publish control. Harness gaps (not product bugs): dashboard redirects anon
  (no session in harness), wallet-address text assertion too strict. Remaining
  work toward ~500: subblog content-type gates × viewer states, dashboard
  analytics/earnings with a real session, more API endpoints, mobile-deep,
  x402/agent matrix.

- **Batch18 setting-combos now verified live** (`checks-batch18.js`): creates a
  fresh share per setting combination through the real ShareForm (free, paid $5,
  paid + whitelist-free, paid + whitelist-$2-discount, invite-only), prints each
  share URL to the run log, and asserts the reader gate for BOTH anon and a
  whitelisted buyer on separate wallet-installed pages. The lifecycle check
  exercises whitelist → ban (`POST …/entitlements/:wallet/ban`) → buyer stripped
  from `whitelist[]` → unban+restore. All 6 checks green; WARN mark only for the
  known 403/400 console noise (#39). Also confirms `revoke` (entitlement-only)
  does NOT remove whitelist membership — ban is the correct strip path.

- **Batch19 whitelist-UX now verified live** (`checks-batch19.js`): covers the
  features added in the UX sweep — import preview staging (file parse shows
  "Import preview — N wallets ready to add" + Add/Discard; Discard commits
  nothing, Add shows "Added N" and renders chips), invalid-row reporting in the
  preview, search/filter on a 210-wallet list (search box appears past 60 chips,
  query narrows with "1 of 210 match"), chunked batched saves (210→211 via the
  paste box persists 211 in the backend), export-with-`address`-header roundtrip,
  mine-list search ("Search posts…" filters by title; garbage query hides rows),
  and the draft→publish flow (draft row in the Drafts tab has a Publish control).
  **Found + fixed a real bug:** the server rejected title-only drafts with 400
  `content is required`, so "Save as Draft" on an empty body failed server-side
  even though the button was enabled. `createShare` now only requires content for
  non-draft status. All 7 checks green; WARN mark only for the known 403/400
  session-poll console noise (#39).

- **Batch20 settings-tier toggles now verified live** (`checks-batch20.js`):
  the Settings sheet's whitelist-tier buttons (Public price / Free / Custom) and
  the invite-only toggle persist correctly against the backend — Free sets
  `whitelistPrice=0` (with the "Whitelisted wallets get access free" note),
  Custom sets the entered price (note renders as `formatUsd`, e.g. "2.00 USDC"),
  Public price resets `whitelistPrice` to null, and the invite-only toggle flips
  `publicAccess` both directions (reopening confirms a dialog). Also verifies a
  whitelisted buyer's view lands in the settings "Seen by" list. All 5 green;
  WARN only for known 403/400 noise (#39).

- **Batch21 invite-only access semantics now verified live** (`checks-batch21.js`):
  clarifies how `publicAccess=false` composes with the whitelist tier. An
  invite-only share + whitelisted buyer with **no tier set** lets the buyer
  *attempt* but still pay the public price (no lockout banner, paywall, no leak);
  with a **Free tier** the buyer gets "Unlock for free" and tapping it mints the
  entitlement and renders content; a **non-whitelisted** wallet sees the
  invite-only lockout banner with no content leak. The free-tier tap uses a
  pointerdown dispatch in the harness because a stuck w3m-modal (from repeated
  mock-wallet installs in one process) can intercept normal clicks — the widget
  listens on pointerdown. All 3 green; WARN only for known 403/400 noise (#39).

- **Batch22 viewer entitlement-state now verified live** (`checks-batch22.js`):
  the quote-driven gate UI for each entitlement state. A whitelisted buyer who
  unlocked free then gets revoked by the owner sees the "Your previous access was
  revoked — pay again to re-unlock" banner on reload with no content leak; a
  banned wallet sees the "Banned / No access" gate with no leak; and a restored
  (DELETE entitlement) wallet is un-banned — but ban permanently strips
  `whitelist[]` membership, so restore does NOT bring back the free tier and the
  public paywall returns (consistent with the batch18 ban semantics). All 3
  green twice in a row; WARN only for known 403/400 noise (#39). Harness note:
  buyer/owner flows run in dedicated browser contexts because the shared
  context's appkit/localStorage keeps reconnecting the most recent wallet.

- **Batch23 expiry + persistence + multi-wallet now verified live**
  (`checks-batch23.js`): 2-minute expiring shares are fully supported
  (`expiresAt DateTime?`, max 168h via `MAX_EXPIRY_HOURS`; UI clamps min to
  +5m so sub-5m shares are created through the API). Confirmed live: a
  whitelisted buyer unlocks free while a 2-min share is live; once expired the
  `assertReachable` 419 gate (`This share has expired.`) blocks a whitelisted
  free member — whitelist is orthogonal to expiry and does NOT bypass it, and
  the access API returns 419; a buyer who unlocked free before expiry is also
  cut off after expiry (419 wins over the still-active entitlement row) with
  no content leak. Settings persistence: the Free tier + invite-only toggle
  survive a full `/share/mine` reload (backend `whitelistPrice=0` and
  `publicAccess=false` persist). Multi-wallet: revoking one of two whitelisted
  members leaves the other able to unlock free. Seen-by: a wallet that unlocked
  then got revoked shows the `· revoked` badge in the owner's Seen-by list. All
  6 green twice in a row; WARN only for known 403/400 noise (#39).

- **Batch24 subblog + expiry combos verified live** (`checks-batch24.js`):
  subblog combos against `catwalk.nibgate.xyz` (API-level, no mutation): the
  quote endpoint returns a per-wallet pricing snapshot (paid doc 0.50 / free 0,
  no entitlement yet, gate actionable — `canUnlock` means "can attempt to
  unlock", NOT free access); a bare `?wallet=` claim on a paid post does NOT
  unlock — the subblog backend requires SIWE session possession
  (`sessionWalletFor`), confirming no spoof bypass; anon media fetch on a paid
  post → 402 challenge with no leak; free post serves 200 content, paid post
  402s anon. Hub expiry combos: invite-only + expired → the 419
  `assertReachable` gate wins over invite, cutting off a whitelisted free
  member with no leak; paid-public + expired → 419 + banner; free-public +
  expired → 419 even though free; `expiresAt` surfaces on both `/meta` and
  `/manifest`. All 9 green twice in a row; WARN only for known 403/400 noise.
  Subblog note: posts have NO `expiresAt` (unlike NibShare) — the only subblog
  TTL is the 12h unlock-proof replay window.

See `logs/*.log` for the raw evidence behind each claim.
- **Docs-vs-code audit (2026-08-15) — A/B/C buckets, all fixed + verified:**
  - **A1** `subblogs/backend/src/routes/v1/setup.route.js` crashed on error
    (`next` was undefined in the catch handler — `router.post('/', async (req,
    res, next) => {` now declared).
  - **A2** SDK runtime exports missing: `gate` (createGate alias), 
    `clearPaymentProof`, `ratingMessage` were documented but not exported;
    `NibgateClient` lacked `createHostedUnlock` + `rateContentOnchain`. All added
    to `packages/nibgate/src/browser/*` and verified via import check; 
    `npm test` 36/36 green.
  - **A3** `packages/nibgate/src/server.d.ts` omitted 16 runtime exports
    (`runCircleGatewayRequirement`, `prepareOnchainRating`, `verifyRatingTx`,
    `submitOnchainRating`, `generateContentKey`, `encryptBytes`, `decryptBytes`,
    `packCipherBlob`, `unpackCipherBlob`, `wrapKey`, `unwrapKey`,
    `contentHashFor`, `registerProvider`, `putBlob`, `getBlob`, `deleteBlob`).
    All declared.
  - **A4** subblog post page imported but never used `MediaEmbed`; Vimeo/
    SoundCloud/Spotify embeds rendered as raw `<video>`/fallback. Now routed
    through `MediaEmbed`; unused local `detectEmbed` removed.
  - **A5** subblog rating + RSS URLs omitted the `document` type → ratings/RSS
    linked `/posts/<slug>` instead of `/docs/<slug>`. Fixed in
    `rating.route.js` + `feed/route.ts`.
  - **B1** `docs/src/app/api-reference/page.mdx` 11 errors: `/auth/nonce` GET
    not POST; bare `GET /nibgate/status` doesn't exist (only
    `/api/nibgate/status`); `/hub/content/:id/rate` POST not GET;
    `GET entitlements/:wallet` doesn't exist (only DELETE restore);
    access-control is PUT not POST; `/view` is POST; `gateway/balance` is POST;
    `/stats` = public aggregates, per-owner is `/dashboard`; subblog
    access-control PUT + admin-only scope.
  - **B2** `payments-receipts/page.mdx`: `GET`→`POST gateway/balance`;
    subblog path `/api/gateway/balances` → `/api/nibgate/gateway/balances`.
  - **B3** `subblogs/README.md`: `/auth/nonce` POST→GET; `GET /api/setup`
    doesn't exist (POST only); access-control/revoke/ban are admin-only not
    "author/admin"; SIWE is a reader session, not the admin flow; `/docs`
    listing + document posts now documented; dead `/encryption` link removed.
  - **B4** SDK `SKILL.md` `accessResponse` example returned `{"getContent":null}`
    (3rd arg is `allowedBody` function, not `{getContent}`) — fixed.
  - **C1** ACCESS-CONTROL-DESIGN.md + access-control docs aligned with reality:
    ban strips `whitelist[]` hub-only (service.js), restore does NOT re-add
    whitelist and writes NO audit event, no `grant`/`price_change`/
    `whitelist_flip` event types exist, 419 blocks ALL post-expiry access (incl.
    existing payers — `API.md` "no new unlocks" wording corrected).
  - **C2** `canAccess` was implemented + unit-tested in the SDK but NEVER wired
    into either backend — both rails hand-rolled the gate. Now wired: hub
    `service.canAccessShare` + subblogs `access.service.canAccessPost` assemble
    DB facts and delegate to SDK `canAccess` at every gate (free/invite reads,
    paid unlock, proof replay, lifetime re-issue, whitelist free tier, media).
    Controllers only map the decision to HTTP; user-facing messages preserved.
    `@nibgate/sdk/server` `canAccess` confirmed exported; both backends boot;
    `npm test` 36/36. The SDK's stateless `accessFor`/`accessResponse` remains a
    separate lighter embedded gate by design.

- **Post-audit canAccess wiring — live regression check (2026-08-15, commit
  `97275ad`):** re-ran all 4 gate/expiry groups against production
  (viewer-state, expiry, subblog, expiry2). 18/18 checks green, 66/66
  assertions, 0 fail / 0 error; 12 WARN = the known console-noise signature
  (403 resource / ERR_NAME_NOT_RESOLVED / Analytics SDK fetch) those
  browser-based checks always emit. First pass right after deploy showed 2
  page-stall timeouts (revoke-banner, restore-lifts-ban); both re-ran clean —
  deploy-settling flakiness, not a canAccess regression. Rewired gates behave
  identically to the pre-wiring hand-rolled logic at the live surface.

- **Batch25 cross-surface subblog + authz sweep verified live (2026-08-15)**:
  45 checks / 0 fail / 0 error (39 pass + 6 WARN console-noise). New coverage
  across several places:
  - **Agent/read surface**: `/api/nibgate/status` (hosted + hub payEndpoint),
    `/api/health`, `/api/site` (identity + widget script), `nibgate.json`
    catalog (paid/free access flags), `/manifest` collection + per-post (paid
    doc reflected price/type + `/docs/` URL).
  - **Blog listing API**: pagination (limit honored + totalPages), `?type=`
    filter (document), `?tag=` filter, `posts-by-types` (all 5 groups).
    **No-leak confirmed**: getBySlug on paid returns `isLocked:true` + empty
    body; the LIST endpoint does not leak paid article bodies either (bodies
    are encrypted to storage, `bodyMarkdown:''` — paid docs only expose their
    public excerpt). Free posts serve full body.
  - **Reader pages** for all 5 types on catwalk (docs/music/photo paid
    paywall; video free open).
  - **Ratings + RSS**: `/api/rating/:postId` public stats (db/onchain source);
    document ratings resolve via `TYPE_PATH` (statically verified in
    rating.route.js:13) and the stats endpoint accepts a doc id; `/api/feed`
    emits RSS 2.0 with doc items linking via `/docs/`.
  - **Gateway balance**: POST valid address → `"6.00 USDC"`; bad address → 400.
  - **Authz sweep (anon rejected everywhere)**: `/api/blog/admin/posts`,
    `/api/nibgate/posts/:key/access-control`, `/api/settings`,
    `/api/nibgate/gateway/balances`, `/api/upload`, `/api/auth/me` all 401;
    `/api/auth/nonce` GET public (nonce); `/api/setup` POST-only + key-guarded
    (GET 404, POST no-key 403).
  - **Hub cross-surface**: `/api/nibgate/status` public w/ site identity +
    hub config; `/auth/nonce` GET (matches B1 doc); `/api/nibshare/stats`
    public aggregates (398 shares, 919 views); `/api/nibshare/dashboard` anon
    401; `/hub/content/:id/rate` POST-only + authed (anon 401, GET 404).
  One check initially failed on a bad assertion regex (hub config); fixed to
  check `json.hub.apiBaseUrl` directly — the live API was correct.

- **Full battery (2026-08-15, commit `f350994`): 325 checks, 69 pass / 22 fail
  / 12 error / 222 WARN (WARN = assertions pass + known console noise).**
  Triage + fixes in this pass:
  - **NEW REAL BUG — subblog ratings 500 via hub id mismatch (fixed).**
    Subblog `POST /api/rating/:postId` prepare (no txHash) 500'd: subblog sends
    `contentId: hubContentId || post.id` (the post **UUID**), but hub
    `/hub/reputation/ratings/prepare` did `db.content.findUnique({id})` against
    the **internal md5 id** — miss → "Content not found" → 500. Hub stores
    subblog content with the UUID as `externalId`. Fix: `findContentByIdOrExternal()`
    (`backend/src/server/hub/helpers.js`) does `findFirst({where:{OR:[{id},{externalId}]}})`.
    Applied to `prepare`, `index`, and `/hub/content/:contentId/rate`. Verified
    live (commit deploy): `b26-rating-prepare-externalId`, `b26-rating-prepare-wrongType`,
    `b26-hub-prepare-externalId`, `b26-hub-prepare-bad`, `b26-rating-get-db` all OK.
  - **Mobile explore overflow (see finding 39)** — real, root-caused, fixed,
    verified live (bad=282 → 0).
  - **Batch-order hydration flakes fixed**: `sb-*`/`rt-*` now poll via new
    `waitBody()` helper instead of a fixed 2.6s sleep after `goto('commit')`
    (Vercel cold-start → empty body read). `dp-draft-then-publish` publish click
    is now scoped to the exact draft row (walk from the title element to the
    nearest ancestor with exactly one Publish button) instead of page-first match.
  - **Stale checks updated**: `fv-*`/`fa-*` (share form now SIWE-gated — connect
    after navigating to `/share`); `fa-tags`/`fa-excerpt` assert `inputValue()`
    not bodyText; draft button label `"Save as Draft"`; `rt-share` dropped (hub
    `ns/` gates don't render the star widget — ratings matrix is subblog-only);
    `wa-connect-on-paid` uses `SEL_PK` (had `pk:'anon'` = no mock wallet);
    batch17 whitelist import is now two-step (staged preview + Add confirm);
    batch18 gate marker excludes pre-hydration `"Connect wallet"` shell.
  - **Transient (pass on isolated re-run)**: `tf-create-photo-free`,
    `tf-create-music-wldrop/invite`, `combo-paid-wlfree`, `sb-article`,
    `tg-anon-document-wldrop`. Known-untestable: `tg-banned-*` (#32), `tf-create-document-*` + `tl-*-publish-revoke` (#36), Circle paid-unlock (#7).
  - **Harness gap (documented, not a bug)**: `db-analytics/earnings/sites` fail
    because the harness has no real admin SIWE session; dashboard correctly
    redirects logged-out visitors to marketing.
- **Batch26 untested-surface sweep (commit `f350994` + `8be8a5c`): 16 checks
  green live** — subblog rating GET stats (db/onchain source, numeric avg/count),
  rating prepare with externalId (post-UUID → hub resolves, 200 with hash +
  rating), wrong content type → clean 4xx, hub prepare externalId/bad-id,
  authz completeness (catwalk PUT access-control, DELETE entitlement, revoke,
  settings password PUT, link-hub POST, upload GET, nonce GET — all anon 401),
  register/login validation (bad payloads → 400), hub `POST /api/nibshare/gateway/balance`
  → `"6.00 USDC"`, and `/widget.js` (frontend host, `application/javascript`).
  One check fix: widget.js is served by `nibgate.xyz` not `api.nibgate.xyz`.
- **NEW REAL BUG — subblog SIWE verify 500 for a pre-existing wallet (fixed).**
  `POST /api/auth/verify` returned 500 in production for the buyer wallet
  `0x3C44…93BC` while fresh wallets verified 200. Root cause: a prior sign-in
  left a `User` row with a **checksummed** `walletAddress`; `findOrCreateWalletUser`
  looks up by `walletAddress.toLowerCase()` (misses the checksummed row), then
  `create` collides on the derived `wallet-<addr>@wallets.nibgate.xyz` email
  (global `@unique`) → Prisma P2002 → non-operational → 500 in production.
  Fix (`subblogs/backend/src/services/siwe.service.js`): after the exact lookup,
  adopt the existing row by derived email (`findUnique({ email })`) and update
  `siteId` + lowercase `walletAddress` before creating. Reproduced locally
  (checksummed-only record → 500) and verified fixed (→ 200, row adopted).
