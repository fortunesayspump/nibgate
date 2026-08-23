# Nibgate — open protocol for paid content

[Website](https://nibgate.xyz) | [Docs](https://docs.nibgate.xyz) | [X](https://x.com/nibgate)

Nibgate is a verified content discovery, unlock, and reputation layer for creator-owned work. Creators keep their content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content without moving it into a closed marketplace.

Built on ARC testnet and the x402 protocol, with two payment rails: Circle Gateway (EIP-3009 facilitator) and direct USDC transfer to the creator's receiver.

**Key packages:**

- **SDK (`packages/nibgate/`)** — `@nibgate/sdk` npm package for gating paid content on any creator site. Browser and server entrypoints, x402/Gateway unlocks, event streaming, onchain ratings. Includes the shared access-control rule (`canAccess`, `normalizeWhitelist`, `paidCutoffWallets`) used by both rails and the encryption primitives (`crypto.js`).
- **Wallet (`packages/wallet/`)** — `@nibgate/wallet` npm package with a `./react` entry: shared Reown AppKit (AppKit + wagmi) wallet provider, SIWE sign-in, and the `<NibgateUnlock>`/`GatewayWallet` single-checkout used by the hub header, Nibshare, and Subblogs.
- **Subblogs (`subblogs/`)** — Full blog platform for creators at `*.nibgate.xyz`. Articles, photos, music, video, documents, free and paid posts. Next.js frontend (port 3002), Express backend (port 4000), PostgreSQL. SIWE wallet auth, whitelists/invite-only tiers, AES-256-GCM encryption at rest.
- **Hub (`frontend/` + `backend/`)** — The main `nibgate.xyz` app: public site, creator dashboard, Explore discovery, analytics, API, Nibshare quick-share rail, and widget hosting.
- **CLI (`packages/cli/`)** — Internal tooling for local dev, site verification, and hub connection.
- **Docs (`docs/`)** — Documentation site at docs.nibgate.xyz.

## Product Thesis

The open web needs a content discovery standard for paid, high-quality resources. Nibgate provides the verified layer that says:

1. this domain is controlled by this creator
2. this content exists at this route
3. this content can be unlocked by humans or agents
4. this creator has real reputation signals from verified activity
5. this payment history routes directly to the configured receiver for the resource

The creator-owned site remains the source of truth, while the hub becomes the public index, analytics surface, and reputation graph around verified content.

It consists of four connected parts:

1. **The Widget**: Creators paste one script on their site. It proves domain ownership, creates visitor/session context, and sends browser-safe page activity to Nibgate.
2. **The Package**: Creators install the `@nibgate/sdk` npm package to gate real content on their own site. The package knows the content, unlock, and payment lifecycle, then reports those events through the widget bridge.
3. **The Hub**: `nibgate.xyz` is the creator dashboard, discovery surface, and analytics layer. It verifies sites, stores content metadata, aggregates metrics, and shows profile/site/content/earnings data.
4. **The Discovery Layer**: Explore, public profiles, content metadata, receipts, and reputation signals make verified creator content readable by people and AI agents.

## Repo Layout

```txt
backend/       Express hub API — payment verification, hosted-pay resolution,
               metrics, site/manifest sync, revenue keeper (fee-wallet sweeps)
frontend/      Next.js hub UI — public site, dashboard, Explore, leaderboards
subblogs/      Subblogs — full blog platform for creators (Express+Prisma + Next.js)
packages/      @nibgate/sdk npm package + wallet package + CLI tooling
contracts/     Solidity + Foundry: reputation contracts and the per-creator
               GatewayFeeWallet / GatewayFeeWalletFactory (revenue model)
docs/          Nextra docs site for docs.nibgate.xyz
scripts/       E2E flows and deployment tooling (reputation, revenue factory)
nibgate.config.json  Sample CLI config (routes to local demo content)
```

Local-only, not tracked: `e2e/` (Playwright browser harness), `swarm/` (agent wallets), `video/`, `v2-labs/`, `revenue-model/` (research/poc). See `.gitignore`.

## Workspace Shape

### `backend/` & `frontend/` (The Hub)

The Hub is the main Nibgate app and API surface. It acts as the creator dashboard, public site, and discovery directory:

- `/explore` The discovery masonry grid indexing all creator content.
- `/ledger` Public activity feed — every unlock, payment, and onchain rating across all sites, searchable and filterable. New entries slide in live.
- `/discovery.md` Agent guidance — plain-language description of Nibgate endpoints, payment flow, and rating flow for AI agents.
- `/auth/*` Sign-In with Ethereum (SIWE) authentication.
- `/hub/*` Hub connection, sync, verification, and event ingestion.
- `/hub/ledger?domain=X` Public ledger endpoint with optional domain filter for per-site activity.

### `subblogs/` (Subblogs — Creator Blog Platform)

This is an example creator blog with paid content gating. Two services:

- **`subblogs/backend/`** (Express + Prisma) — serves content pages, handles payments via the hub, issues unlock proofs. When R2 is configured, all post bodies and media are encrypted at rest (free and paid); free content is decrypted server-side and served to anyone, paid content only after onchain proof verification. The access endpoint (`GET /api/<type>/<slug>`, a short mirror of `GET /api/nibgate/access`) is the single source of truth for premium content — returns post body only after proof verification. Each post page also self-describes for agents: `GET /api/nibgate/manifest?path=/<type>/<slug>` returns the per-post machine-readable contract (advertised via a `<link rel="alternate">` element and the `Link` response header).
- **`subblogs/frontend/`** (Next.js) — public blog UI. Premium content is **never** in the HTML. The `NibgateUnlock` component fetches content from the protected access endpoint after proof verification. Admin panel (`/admin/posts`) has a per-post stats sheet showing unlocks, revenue in USDC, and the underlying receipts for each post.

**Critical rule:** The `GET /api/blog/posts/:slug` endpoint decrypts and returns the body for **free** posts, and strips the `body` from **paid** posts. Premium body is only returned by the access endpoint (`GET /api/<type>/<slug>` or `GET /api/nibgate/access`) after valid proof. This prevents paid content from ever appearing in page source, while free content still reads publicly.

### `nibshare` (Quick-Share Gated Content)

A hosted quick-share rail inside the hub: a wallet owner publishes an encrypted payload with an optional price, wallet whitelist, and a required expiry (max 7 days out), and gets a short link at `nibgate.xyz/ns/<slug>`. No domain required. Bodies and media are always AES-256-GCM encrypted at rest in Cloudflare R2; unlock is x402 USDC on Arc via the server-side decrypt proxy (free public shares read openly, invite-only shares require a session-corroborated whitelisted wallet, paid shares after payment). This is a **private** product — it is never indexed in hub discovery, the ledger, or reputation. The share page self-describes for agents: `GET /nibshare/:slug/manifest` (also reachable at `https://api.nibgate.xyz/ns/<slug>`, the short read route) returns the machine-readable contract (advertised via `<meta name="nibgate:*">`, JSON-LD, `data-nibgate-*` attributes, a `<link rel="alternate">` element, and the `Link` response header), and the Nibgate MCP server exposes it as the `resolve_share` tool.

Server source is at `backend/src/server/nibshare/{controller,service,utils,routes}.js`; it delegates access decisions to the SDK's `access-policy.js` (possession rule, pay-before-deny, idempotent receipt granting) and exposes the same entitlement/ban/revoke finance as Subblogs.

Docs live with the implementation, not in a separate top-level folder:

- `backend/src/server/nibshare/README.md` — product, threat model, auth, env
- `backend/src/server/nibshare/API.md` — the HTTP contract
- `backend/src/server/nibshare/STORAGE.md` — R2 layout, encryption, media serving
- `backend/src/server/nibshare/STORAGE-TIER-PLAN.md` — planned Arweave/Lit tiers (not shipped)

### `packages/nibgate/`

This is the public creator package. It is intentionally tiny and framework-agnostic:

```bash
npm install @nibgate/sdk
```

Agents and coding assistants should read the compact integration guide before editing a creator site:

- package copy: `node_modules/@nibgate/sdk/SKILL.md`
- public copy: `https://nibgate.xyz/skill.md`

It owns:

- browser entrypoint: `createGate(...)`, `nibgate.content(...)`, `nibgate.view(...)`, `nibgate.unlockStarted(...)`, `nibgate.unlockCompleted(...)`, and `nibgate.paymentCompleted(...)`
- server entrypoint: `createNibgateServer(...)`, `protect(...)`, `nibgateServer.accessFor(...)`, payment challenges, and unlock token verification
- queueing events until the Hub widget is ready
- normalizing content types to `music`, `video`, `article`, `image`, and `document`
- access policies for humans and agents: `free`, `paid`, or `blocked`
- unlock policies that start with `one_time` for the MVP and leave room for metered reading, streaming, passes, and agent quotas later

### `packages/cli/`

The CLI package is private internal tooling for local development and future setup automation. It owns:

- `npx nibgate`
- local status and setup checks
- config generation helpers
- hub connection and domain verification commands
- future scaffolding around widget/package setup

The public `@nibgate/sdk` package owns route protection, payment challenge metadata, unlock tokens, and package event APIs.

### `demo/`

Local-only and not tracked in this repo. An origin app that behaves like a creator-owned site, used to validate the install flow, DB-backed content mapping, package events, and protected content flow without polluting hub code. Real-template examples belong under `demo/examples/*`, where each example starts from a recognizable starter repo and adds the Nibgate package integration. If your checkout has no `demo/` directory, skip the demo commands below — everything else runs without it.

## Run

Install once:

```bash
npm install
```

Start the backend:

```bash
npm run dev:backend
```

Start the frontend:

```bash
npm run dev:frontend
```

Start the example creator origin (requires the local-only `demo/` directory — skip if your checkout doesn't have it):

```bash
cd demo/examples/next-mdx-blog
NIBGATE_SITE_ORIGIN=http://localhost:4301 npm run dev -- -p 4301
```

Open:

- [http://localhost:3001](http://localhost:3001)
- [http://localhost:3001/explore](http://localhost:3001/explore)
- [http://localhost:4301](http://localhost:4301)

## Environment

Backend variables:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/railway
CORS_ORIGIN=https://nibgate.xyz,http://localhost:3001
BLOG_OWNER_WALLET=0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12
RESEND_API_KEY=your_resend_api_key
RESEND_NEWSLETTER_SEGMENT_ID=seg_your_newsletter_segment_id
RESEND_NEWSLETTER_TOPIC_ID=topic_your_newsletter_topic_id
METRIC_HASH_SALT=generate_a_long_random_secret
TRACKING_RATE_LIMIT_MAX=180
TRACKING_RATE_LIMIT_WINDOW_MS=60000
TRACKING_VIEW_DEDUPE_WINDOW_MS=1800000
MANIFEST_SYNC_INTERVAL_MS=900000
MANIFEST_SYNC_RETRY_AFTER_MS=1800000
MANIFEST_SYNC_BATCH_SIZE=100
```

For production, attach a Railway Postgres database to the backend service and use Railway's `DATABASE_URL` value. The Prisma datasource is PostgreSQL-only now, so every backend environment must provide `DATABASE_URL`.

`BLOG_OWNER_WALLET` is the single signed wallet that can create, edit, publish, draft, or delete posts from `/dashboard/blog`. No other wallet can access the editor APIs.

Newsletter signups are stored in the local `NewsletterSubscriber` table first. If `RESEND_API_KEY` is configured, the backend also syncs each signup into Resend Contacts. `RESEND_NEWSLETTER_SEGMENT_ID` and `RESEND_NEWSLETTER_TOPIC_ID` are optional, but recommended so newsletter signups are grouped separately from transactional contacts. Without Resend envs, signups still save locally with a pending sync status.

`METRIC_HASH_SALT` is used to create privacy-preserving server-side visitor hashes for analytics dedupe. Use a stable secret in production; rotating it resets unique visitor continuity. Tracking dedupe defaults are 30 minutes for page/resource views, 24 hours for content registration and payment/unlock payment ids, 5 minutes for time events, and 30 seconds for engagement events. The backend also rate-limits `/hub/evt` (the legacy `/api/hub/track` alias still works) per site/IP/visitor bucket.

Manifest sync keeps Explore and dashboard metadata fresh when creators change titles, descriptions, images, prices, tags, or routes. The backend reads verified-site manifests from `/nibgate.json`, `/.well-known/nibgate.json`, `/v1/nibgate/manifest`, or `/v1/nibgate/nibgate.json`. Creators can also refresh a site manually from `/dashboard/sites`; event traffic from the widget/package still updates the same content record whenever the stable content id is seen again.

Frontend variables:

```bash
NEXT_PUBLIC_API_URL=https://api.nibgate.xyz
```

When running locally, point `NEXT_PUBLIC_API_URL` at the local backend so `/api/*` rewrites and public server-rendered blog pages read from the same API.

After changing the Prisma schema, sync the database and regenerate the client before running the backend:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/railway \
pnpm --filter @nibgate/cli exec prisma db push

DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/railway \
pnpm --filter @nibgate/cli exec prisma generate
```

Production deploys that change `packages/cli/prisma/schema.prisma` need the same `prisma db push` against the Railway database before the new backend starts handling traffic.

## CLI

Useful local commands:

```bash
npm run routes
npx nibgate status
npx nibgate connect
npx nibgate verify
npx nibgate event resource_view premium-article
npx nibgate balance
npx nibgate deposit 1.0
```

Package-facing shape:

```bash
npx nibgate init
npx nibgate dev
npx nibgate routes
```

## Product Flow

Nibgate uses a verified discovery event architecture:

```txt
Creator site
  Hub widget
    - verifies ownership
    - owns siteId/token/session context
    - sends events to the backend

  Nibgate package
    - gates real creator content
    - knows content metadata and unlock/payment lifecycle
    - calls window.nibgateHub when content is viewed, unlocked, or paid for

Nibgate backend
  - validates siteId/token/origin
  - stores content metadata
  - stores metric events
  - aggregates dashboard data
  - updates discovery and reputation signals
```

When a creator installs `@nibgate/sdk` on their own site, the package is responsible for:

1. protecting paid routes and gated content on the creator origin with server-side access checks
2. handling x402/Circle unlock logic
3. registering content metadata for `music`, `video`, `article`, `image`, and `document`
4. emitting content-level events such as `resource_view`, `unlock_started`, `unlock_completed`, and `payment_completed`
5. passing resource ids, titles, prices, and paths to the Hub widget when users interact with protected content

For real blogs and CMS-backed sites, gating fields should live beside the creator's content record in their own database or admin UI. Nibgate maps that row into a resource:

```js
{
  id,
  title,
  type,
  price,
  path,
  access: {
    humans: 'free' | 'paid' | 'blocked',
    agents: 'free' | 'paid' | 'blocked'
  },
  unlock: {
    mode: 'one_time'
  }
}
```

This works across Next.js, React plus an API backend, Express, NestJS, Remix, SvelteKit, Astro SSR, MDX server rendering, headless CMS apps, and traditional CMS/plugin environments. Plain static HTML can use the widget for verification and events, but protected content still needs a server, edge function, API route, or signed URL.

For the hackathon MVP, unlocks should be simple and real:

```txt
pay once -> verify receipt/proof -> issue unlock token -> serve content -> report receipt to Nibgate
```

The package keeps an `unlock` policy field so future versions can add richer modes without changing the creator integration shape:

```js
unlock: { mode: 'one_time' }       // MVP
unlock: { mode: 'metered_stream' } // later: pay by watched seconds/minutes
unlock: { mode: 'metered_read' }   // later: pay by section/paragraph/token window
unlock: { mode: 'time_pass' }      // later: pay for time-limited access
unlock: { mode: 'agent_quota' }    // later: pay for agent reads/crawls
```

Only `one_time` should be treated as production-ready for the first release.

The Hub widget is responsible for:

1. proving site ownership with one script tag on the creator domain
2. automatically sending page views
3. detecting content markers from `data-nibgate-*` attributes or `nibgate:*` meta tags
4. exposing `window.nibgateHub.registerContent(...)`, `window.nibgateHub.track(...)`, and unlock/payment helpers so the package can stream individual resource events
5. attaching site id, public token, visitor id, session id, URL, path, referrer, and scroll depth before sending to the backend

The hub is responsible for:

1. registering the site
2. verifying domain ownership by fetching the creator homepage and checking for the widget token
3. ingesting events for page views, content views, unlocks, revenue, and performance
4. indexing resource metadata from streamed package/widget events

That keeps real content and enforcement on the creator domain while the hub stores only the metadata, events, receipts, and aggregates needed for discovery, analytics, earnings, and reputation.

## Discovery and Reputation

Nibgate discovery is not just a public gallery. It is the index of verified creator-owned content that humans and agents can trust enough to browse, cite, unlock, and route payments toward.

The public ledger (`/ledger`) provides a live, auditable feed of every view, unlock, payment, and rating with on-chain proof links. Each row is expandable for full detail — wallet addresses, tx hashes, timestamps. Stats totals animate on update.

The hub can rank and filter content using:

1. verified domain ownership
2. content type: `music`, `video`, `article`, `image`, or `document`
3. creator profile and username
4. page views, content views, unlock attempts, and paid unlocks
5. direct x402 or Arc testnet receipt metadata
6. freshness, tags, source routes, and referral signals
7. future human and agent feedback tied to real interactions

Reputation starts at the content level. In the current MVP, content/site/creator reputation combines verified package/widget activity with stronger payment, unlock receipt, and indexed onchain rating signals. Reputation-critical actions are proof-gated: payment/unlock receipts need provider proof, and ratings are accepted through the onchain reputation contract/indexer after unlock eligibility is proven.

The intended unlock model remains creator-site native:

1. creator publishes content metadata from their own site
2. buyer or agent pays/unlocks the content through x402, Gateway, direct wallet payment, or another site-owned rail
3. the package reports the unlock/payment receipt to Nibgate
4. the verified receipt makes that wallet eligible to rate
5. the wallet submits an onchain rating transaction for the content
6. Nibgate indexes the rating event, matches it to the unlock proof, and updates reputation alongside analytics context

Public content reputation can be shown as a `0.0-5.0` star rating. Site reputation and creator reputation then roll up from content ratings plus verification health, consistency, receipts, and source quality.

Creator reputation should be a `1-100` score for the wallet/account that owns verified sites and the content under them. That means creator trust can grow from actual unlocks, payment receipts, ratings from eligible wallets/agents, useful agent feedback, and content quality signals connected back to the verified source. It also means a creator can have a strong overall reputation while a specific new piece is still earning trust.

## Local Connect Flow

1. Sign in to the Hub with a wallet.
2. Add a site from the dashboard.
3. Copy the generated widget script.
4. Paste it into the creator site HTML.
5. Deploy the creator site.
6. Click verify in the Hub.

Widget snippet shape:

```html
<script
  async
  src="https://www.nibgate.xyz/widget.js"
  data-nibgate-site="SITE_ID"
  data-nibgate-token="PUBLIC_SITE_TOKEN"
  data-nibgate-api="https://api.nibgate.xyz"
></script>
```

Content-level registration and tracking should be emitted by the package through the widget:

```js
import { createGate } from '@nibgate/sdk';

const premiumGuide = createGate({
  id: "premium-guide",
  title: "Premium Guide",
  type: "article",
  price: "0.01",
  path: "/premium-guide",
  access: {
    humans: "paid",
    agents: "paid"
  },
  unlock: {
    mode: "one_time"
  }
});

premiumGuide.content();
premiumGuide.view();

await premiumGuide.unlock(async () => {
  // Run payment and server-side verification here.
  return {
    paymentId: "payment_123",
    paymentProvider: "arc-testnet",
    txHash: "0x...",
    chainExplorerUrl: "https://testnet.arcscan.app/tx/0x...",
    revenue: 0.01,
    currency: "USDC"
  };
});
```

The lower-level bridge remains available for advanced integrations:

```js
import { nibgate } from '@nibgate/sdk';

nibgate.unlockCompleted("premium-guide", {
  revenue: 0.01,
  currency: "USDC"
});
```

The package talks to `window.nibgateHub` under the hood. If creator code runs before the async widget finishes loading, package events are queued in the browser and flushed when the widget becomes available.

Server-side protection lives under `@nibgate/sdk/server`:

```js
import { createCircleGatewayServer } from '@nibgate/sdk/server';

const nibgateServer = createCircleGatewayServer({
  secret: process.env.NIBGATE_SECRET,
  recipient: process.env.NIBGATE_SELLER_ADDRESS,
  async verifyPayment({ payment }) {
    // Plug Circle/x402 verification here.
    return Boolean(payment.paymentId);
  }
});

export const GET = nibgateServer.protect({
  id: "premium-guide",
  title: "Premium Guide",
  type: "article",
  price: "0.01",
  path: "/premium-guide"
}, async () => {
  return new Response("Premium content");
});
```

Earnings are non-custodial. The package/server flow should send payment to the receiving address configured for that creator site. One creator can connect multiple sites, and each site can use a different receiver. Nibgate Hub stores the payment/unlock records for analytics and accounting; it does not custody funds or expose a withdraw flow.

Receipt handling is provider-aware:

- Circle Gateway payments should store `paymentProvider: "circle-gateway"`, `paymentId`, and `receiptUrl` only if Circle or the gateway integration returns a real receipt URL.
- Arc testnet payments should store `paymentProvider: "arc-testnet"`, `txHash`, `chainId`, and optionally `chainExplorerUrl` for the Arcscan transaction page.
- If neither a Circle receipt URL nor an Arc explorer URL exists, the hub shows the internal recorded payment id/hash instead of inventing a fake receipt.

Or declared in markup:

```html
<article
  data-nibgate-resource
  data-nibgate-id="premium-guide"
  data-nibgate-title="Premium Guide"
  data-nibgate-type="article"
  data-nibgate-price="0.01"
>
  ...
</article>
```

Hub endpoints:

- `POST /hub/sites/register`
- `POST /hub/sites/:websiteId/verify`
- `POST /hub/track`
- `GET /hub/sites`
- `GET /hub/dashboard/content`
- `GET /hub/dashboard/analytics`
- `GET /hub/dashboard/earnings`

## Tracking Model

The widget does not treat a whole site as one undifferentiated blob. It can record:

- page views for each route where the script loads
- resource views when a page has `data-nibgate-resource` markup or `nibgate:*` meta tags
- package events when the installed `nibgate` runtime calls `window.nibgateHub.track(...)`
- unlock and payment events tied to a specific resource id

That means one domain can have many tracked resources, but Nibgate content types are intentionally limited to `music`, `video`, `article`, `image`, and `document`.

## Storage Model

The hub store is PostgreSQL through Prisma:

- creator content still lives on the creator site
- resource metadata is created or updated from streamed widget/package events
- site, content, analytics, and earnings records live in Postgres

## Payments


For browser wallet checkout, the creator access route must return Circle Gateway's real `PAYMENT-REQUIRED` batching challenge. The simplest safe setup is `createCircleGatewayServer(...)`; the manual equivalent is `createNibgateServer({ paymentMode: 'circle-gateway', network: 'eip155:5042002' })`.

### Revenue model (fee wallets + protocol fee)

On Nibgate-hosted surfaces (hub widget checkout, Subblogs), payments go to a per-creator `GatewayFeeWallet` contract instead of the creator EOA. The contract is immutable (no proxy/admin), keeps 99% for the creator, and routes a 1% protocol fee to the treasury on `distribute()` — enforced on-chain with a hard 5% cap set at deploy. A background keeper sweeps settled balances to creator wallets. Full model, diagrams, and env reference: [docs/revenue-model](https://docs.nibgate.xyz/revenue-model) and `contracts/GatewayFeeWallet.sol`.

```bash
NIBGATE_HOSTED_PAY=true \
NIBGATE_FEE_WALLET_FACTORY=0xYourFactoryAddress \
NIBGATE_TREASURY=0xYourTreasuryAddress \
NIBGATE_FEE_KEEPER=1 \
NIBGATE_KEEPER_PRIVATE_KEY=0xyourKeeperPrivateKey \
npm run dev
```

Circle Gateway mode (requires the local-only `demo/` directory):

```bash
NIBGATE_PAYMENT_MODE=circle-gateway \
NIBGATE_SELLER_ADDRESS=0xYourSellerWallet \
NIBGATE_BUYER_PRIVATE_KEY=0xyourBuyerPrivateKey \
NIBGATE_BUYER_CHAIN=arcTestnet \
npm run dev:demo
```

Gateway balance helpers:

```bash
NIBGATE_PAYMENT_MODE=circle-gateway \
NIBGATE_BUYER_PRIVATE_KEY=0xyourBuyerPrivateKey \
NIBGATE_BUYER_CHAIN=arcTestnet \
npx nibgate balance

NIBGATE_PAYMENT_MODE=circle-gateway \
NIBGATE_BUYER_PRIVATE_KEY=0xyourBuyerPrivateKey \
NIBGATE_BUYER_CHAIN=arcTestnet \
npx nibgate deposit 1.0
```

### Direct rail (transfer)

The second payment rail sends USDC straight from the buyer's wallet to the creator's `payTo` address — no Gateway facilitator. The browser checkout broadcasts the transfer and submits the tx hash as `x-nibgate-transfer-tx` on the access retry; the server verifies the mined receipt on-chain (USDC `Transfer` log to the seller for at least the price) before minting the unlock proof. Receipts are stored with `paymentProvider: 'direct-transfer'`. In the unlock UI, `NibgateUnlock`/`useNibgateUnlock` switch between the two rails via the `paymentRail` option (`'gateway'` or `'transfer'`).

Because a broadcast transfer is public chain data, the retry must also carry an **ownership proof**: an EIP-191 signature (made by the paying wallet) over

```
Nibgate transfer ownership
tx:<txHash lowercased>
resource:<resource path or url>
```

sent as the `x-nibgate-tx-owner` header (`transferOwnershipMessage()` builds this string). Missing/mismatched proofs fail with `transfer-ownership-proof-required` / `transfer-owner-mismatch`. Self-hosters can opt out with `NIBGATE_TX_OWNER_PROOF_OPTIONAL=true`; hosted surfaces additionally claim each txHash single-use per content id.

```js
import { payWithTransfer, createTransferCheckout } from '@nibgate/sdk'

await payWithTransfer(resource, {
  accessPath: '/api/nibgate/access',
  checkout: createTransferCheckout(resource, {
    sendTransfer: async ({ recipient, amount }) => /* broadcast USDC transfer, return { txHash } */
  })
})
```

### Wallet-tied access

Paid unlocks are wallet-bound, not device-bound. After paying, the wallet has a lifetime entitlement backed by its receipt; reconnect the wallet (and sign in via SIWE) on any device and the server re-verifies the receipt and ban status and re-serves the content — no re-pay. The unlock UI never grants from a device-stored proof unless a wallet is connected, and it relocks (tears down the payload + clears the proof) on disconnect.

## Local URLs

- Hub frontend: `http://localhost:3001`
- Hub Explore: `http://localhost:3001/explore`
- Hub backend API: `http://localhost:3000`
- Subblogs frontend: `http://localhost:3002`
- Subblogs backend API: `http://localhost:4000`
- Example origin: `http://localhost:4301`
- Demo premium route: `http://localhost:4301/hello-world`
- Hub widget: `http://localhost:3001/widget.js`

Run the backend first, then run the local package-to-hub proof script:

```bash
npm run dev:backend
npm run e2e:nibgate
```
