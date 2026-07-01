# Nibgate

Nibgate is a verified content discovery, unlock, and reputation layer for creator-owned work.

Creators keep their content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content without moving it into a closed marketplace.

## Product Thesis

The open web needs a content discovery standard for paid, high-quality resources. Search can find pages, marketplaces can host inventory, and payment rails can unlock access, but creators still need one trusted layer that says:

1. this domain is controlled by this creator
2. this content exists at this route
3. this content can be unlocked by humans or agents
4. this creator has real reputation signals from verified activity
5. this payment history routes directly to the creator's configured receiver

Nibgate is that layer. The creator-owned site remains the source of truth, while the hub becomes the public index, analytics surface, and reputation graph around verified content.

It consists of four connected parts:

1. **The Widget**: Creators paste one script on their site. It proves domain ownership, creates visitor/session context, and sends browser-safe page activity to Nibgate.
2. **The Package**: Creators install the `nibgate` npm package to gate real content on their own site. The package knows the content, unlock, and payment lifecycle, then reports those events through the widget bridge.
3. **The Hub**: `nibgate.xyz` is the creator dashboard, discovery surface, and analytics layer. It verifies sites, stores content metadata, aggregates metrics, and shows profile/site/content/earnings data.
4. **The Discovery Layer**: Explore, public profiles, content metadata, receipts, and reputation signals make verified creator content readable by people and AI agents.

## Repo Layout

```txt
backend/      Express SSR server, Prisma DB, API routes
frontend/     Optimized static CSS pipeline and assets
packages/     Nibgate npm package and internal tooling
demo/         Isolated mock creator site for integration testing
docs/         Nextra docs site for docs.nibgate.xyz
internal-docs/ Architecture, research, design-system notes, and planning
ideas/        Product thinking and experiments
```

## Workspace Shape

### `backend/` & `frontend/` (The Hub)

The Hub is 100% Server-Side Rendered (SSR) for absolute maximum speed and SEO. It acts as the central directory:

- `/explore` The discovery masonry grid indexing all creator content.
- `/api/auth/*` Sign-In with Ethereum (SIWE) authentication.
- `/api/hub/*` Hub connection, sync, verification, and event ingestion.

### `packages/nibgate/`

This is the public creator package. It is intentionally tiny and browser-first:

```bash
npm install nibgate
```

It owns:

- `gate(...)`
- `nibgate.content(...)`
- `nibgate.view(...)`
- `nibgate.unlockStarted(...)`
- `nibgate.unlockCompleted(...)`
- `nibgate.paymentCompleted(...)`
- queueing events until the Hub widget is ready
- normalizing content types to `music`, `video`, `article`, and `image`

### `packages/cli/`

The CLI package is private internal tooling for local development and future setup automation. It owns:

- `npx nibgate`
- config generation
- route protection and gateway logic
- x402 and Circle Gateway integration
- hub connection, domain verification, and widget/package content events

### `examples/`

These are origin apps that simulate creator-owned sites. They exist to validate the install flow and protected content flow without polluting product code.

## Run

Install once:

```bash
npm install
```

Start the app (Hub Backend + Frontend assets):

```bash
npm run dev:backend
```

Start the example creator origin (Mock Site):

```bash
npm run dev:demo
```

Open:

- [http://localhost:3000](http://localhost:3000)
- [http://localhost:3000/explore](http://localhost:3000/explore)
- [http://localhost:4100](http://localhost:4100)

## Environment

Backend variables:

```bash
CORS_ORIGIN=https://nibgate.xyz,http://localhost:3001
BLOG_OWNER_WALLET=0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12
```

`BLOG_OWNER_WALLET` is the single signed wallet that can create, edit, publish, draft, or delete posts from `/dashboard/blog`. No other wallet can access the editor APIs.

Frontend variables:

```bash
NEXT_PUBLIC_API_URL=https://api.nibgate.xyz
```

When running locally, point `NEXT_PUBLIC_API_URL` at the local backend so `/api/*` rewrites and public server-rendered blog pages read from the same API.

After changing the Prisma schema, sync the database and regenerate the client before running the backend:

```bash
npm --workspace @nibgate/cli exec prisma db push
npm --workspace @nibgate/cli exec prisma generate
```

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

When a creator installs `nibgate` on their own site, the package is responsible for:

1. protecting paid routes and gated content on the creator origin
2. handling x402/Circle unlock logic
3. registering content metadata for `music`, `video`, `article`, and `image`
4. emitting content-level events such as `resource_view`, `unlock_started`, `unlock_completed`, and `payment_completed`
5. passing resource ids, titles, prices, and paths to the Hub widget when users interact with protected content

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

The hub can rank and filter content using:

1. verified domain ownership
2. content type: `music`, `video`, `article`, or `image`
3. creator profile and username
4. page views, content views, unlock attempts, and paid unlocks
5. direct x402 or Arc testnet receipt metadata
6. freshness, tags, source routes, and referral signals
7. future human and agent feedback tied to real interactions

Reputation should start at the content level. Each article, image, music drop, video, or paid route earns its own content reputation from verified activity. Public content reputation can be shown as a 0-5 star rating. Site reputation and creator reputation then roll up from those content scores plus verification health, consistency, receipts, and feedback.

Creator reputation should be a 1-100 score for the wallet/account that owns verified sites and the content under them. That means creator trust can grow from actual unlocks, payment receipts, returning viewers, useful agent feedback, and content quality signals connected back to the source domain. It also means a creator can have a strong overall reputation while a specific new piece is still earning trust.

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
  src="https://nibgate.xyz/widget.js"
  data-nibgate-site="SITE_ID"
  data-nibgate-token="PUBLIC_SITE_TOKEN"
></script>
```

Content-level registration and tracking should be emitted by the package through the widget:

```js
import { gate } from 'nibgate';

const premiumGuide = gate({
  id: "premium-guide",
  title: "Premium Guide",
  type: "article",
  price: "0.01",
  path: "/premium-guide"
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
import { nibgate } from 'nibgate';

nibgate.unlockCompleted("premium-guide", {
  revenue: 0.01,
  currency: "USDC"
});
```

The package talks to `window.nibgateHub` under the hood. If creator code runs before the async widget finishes loading, package events are queued in the browser and flushed when the widget becomes available.

Server-side protection lives under `nibgate/server`:

```js
import { createNibgateServer } from 'nibgate/server';

const nibgateServer = createNibgateServer({
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

- `POST /api/hub/sites/register`
- `POST /api/hub/sites/:websiteId/verify`
- `POST /api/hub/track`
- `GET /api/hub/sites`
- `GET /api/hub/dashboard/content`
- `GET /api/hub/dashboard/analytics`
- `GET /api/hub/dashboard/earnings`

## Tracking Model

The widget does not treat a whole site as one undifferentiated blob. It can record:

- page views for each route where the script loads
- resource views when a page has `data-nibgate-resource` markup or `nibgate:*` meta tags
- package events when the installed `nibgate` runtime calls `window.nibgateHub.track(...)`
- unlock and payment events tied to a specific resource id

That means one domain can have many tracked resources, but Nibgate content types are intentionally limited to `music`, `video`, `article`, and `image`.

## Storage Model

The current local hub store is SQLite through Prisma:

- creator content still lives on the creator site
- resource metadata is created or updated from streamed widget/package events
- local stats and connection records are stored in the development database

For production `nibgate.xyz`, durable analytics and verification history still need a real external store such as Postgres, Supabase, or another hosted database/KV layer.

## Payments

Example mode is the default:

```bash
NIBGATE_PAYMENT_MODE=demo npm run dev:app
```

Circle Gateway mode:

```bash
NIBGATE_PAYMENT_MODE=circle-gateway \
NIBGATE_SELLER_ADDRESS=0xYourSellerWallet \
NIBGATE_BUYER_PRIVATE_KEY=0xyourBuyerPrivateKey \
NIBGATE_BUYER_CHAIN=arcTestnet \
npm run dev:app
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

## Local URLs

- Home: `http://localhost:3000`
- Explore: `http://localhost:3000/explore`
- Example article: `http://localhost:3000/demo/ghost/the-agent-economy`
- Protected example route: `http://localhost:3000/protected/demo-blog/premium-agent-economy`
- Example origin: `http://localhost:4100`
- Hub widget: `http://localhost:3000/widget.js`
