# Nibgate

Nibgate is a paid-access layer for the open web.

Creators install the `nibgate` package on their own site. `nibgate.xyz` is the main product site, and `/explore` is the public network surface for exploration, publishing, analytics, and onboarding.

## Repo Layout

```txt
app/          deployable web product and hub API
packages/     publishable npm packages
examples/     local origin sites used for integration testing
docs/         architecture and build notes
ideas/        product thinking and planning
```

## Workspace Shape

### `app/`

The app is the single deployable product:

- `/` public home and product entry
- `/explore` creator and public network surface
- `/api/hub/*` hub connection, sync, verification, and event ingestion
- paid example routes for local testing

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

Start the app:

```bash
npm run dev:app
```

Start the example origin:

```bash
npm run dev:example:blog
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
