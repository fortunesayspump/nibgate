# Nibgate

Nibgate is a paid-access layer and discovery engine for the open web.

It consists of two massive parts:
1. **The Package**: Creators (bloggers, photographers, musicians) install the `nibgate` npm package on their own personal websites. It automatically gates premium content (images, articles) behind an X402 crypto paywall (e.g., 0.01 cents per unlock). 
2. **The Hub**: `nibgate.xyz` acts as the central Discovery Search Engine. When a creator installs the package, their website becomes a node that streams analytics and content metadata back to the Hub via a `manifest.json`. Users can search for content across all independent creator sites from this one central place.

## Repo Layout

```txt
backend/      Express SSR server, Prisma DB, API routes
frontend/     Optimized static CSS pipeline and assets
packages/     Publishable npm packages (e.g., the CLI tool and payment gateway)
demo/         Isolated mock creator site for integration testing
docs/         Architecture and build notes
ideas/        Product thinking and planning
```

## Workspace Shape

### `backend/` & `frontend/` (The Hub)

The Hub is 100% Server-Side Rendered (SSR) for absolute maximum speed and SEO. It acts as the central directory:

- `/explore` The discovery masonry grid indexing all creator content.
- `/api/auth/*` Sign-In with Ethereum (SIWE) authentication.
- `/api/hub/*` Hub connection, sync, verification, and event ingestion.

### `packages/cli/`

The CLI package owns:

- `npx nibgate`
- config generation
- route protection and gateway logic
- x402 and Circle Gateway integration
- manifest generation
- hub connection, sync, verification, and signed events

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

## CLI

Useful local commands:

```bash
npm run routes
npx nibgate manifest
npx nibgate status
npx nibgate connect
npx nibgate sync
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

When a creator installs `nibgate` on their own site, the package is responsible for:

1. exposing `/.well-known/nibgate.json`
2. exposing `/.well-known/nibgate-verify.txt`
3. protecting paid routes on the origin
4. optionally sending signed events to the hub

The hub is responsible for:

1. registering the site
2. verifying domain ownership
3. fetching and indexing resource metadata
4. ingesting events for views, unlocks, revenue, and performance

That keeps real content and enforcement on the creator domain while the hub stores only the metadata and aggregates needed for discovery and analytics.

## Local Connect Flow

```bash
npx nibgate init
npx nibgate connect
npx nibgate sync
npx nibgate verify
```

Local site endpoints:

- `/.well-known/nibgate.json`
- `/.well-known/nibgate-verify.txt`
- `/api/nibgate/status`

Hub endpoints:

- `POST /api/hub/sites/connect`
- `POST /api/hub/sites/sync`
- `POST /api/hub/sites/verify`
- `POST /api/hub/events`
- `GET /api/hub/summary`

## Storage Model

The current hub store is file-backed for development:

- creator content still lives on the creator site
- resource metadata can be fetched live from creator manifests
- local stats and connection records are stored in `.nibgate/hub.json`

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
- Agent manifest: `http://localhost:3000/.well-known/nibgate.json`
