# Nibgate

Nibgate is a paid-access layer for the open web.

The product now has three clear parts:

- `app/` - the public site and the main Nibgate web product
- `cli/` - the installable CLI and gateway runtime
- `demo-projects/` - example origin sites used for testing

## Repo Layout

```txt
app/            Nibgate web app
cli/            npm package, gateway runtime, shared core
demo-projects/  sample origin apps
docs/           notes and architecture docs
```

## What Lives Where

### `app/`

The app is both the public site and the product surface we are growing into:

- discovery
- onboarding
- paid resource presentation
- reader and creator experience

Right now it hosts:

- `/` for the public landing page
- `/app` for the operational app UI
- demo routes and the main local runtime at `http://localhost:3000`

### `cli/`

The CLI owns:

- `npx nibgate`
- config generation
- route protection and gateway logic
- x402 and Circle Gateway integration
- local buyer balance/deposit helpers

### `demo-projects/`

These are disposable example origin apps, not product code.

## Run

Install once:

```bash
npm install
```

Run the app:

```bash
npm run dev:app
```

Open [http://localhost:3000](http://localhost:3000).

Run the demo blog:

```bash
npm run dev:demo:blog
```

Open [http://localhost:4100](http://localhost:4100).

## CLI

During local development:

```bash
npm run routes
npx nibgate balance
npx nibgate deposit 1.0
```

Packaged shape:

```bash
npx nibgate init
npx nibgate dev
npx nibgate routes
```

## Live Payment Mode

Demo mode is the default:

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

To inspect or top up Gateway balance:

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

## Current Demo URLs

- Home: `http://localhost:3000`
- App: `http://localhost:3000/app`
- Demo article: `http://localhost:3000/demo/ghost/the-agent-economy`
- Protected demo route: `http://localhost:3000/protected/demo-blog/premium-agent-economy`
- Demo blog origin: `http://localhost:4100`
- Agent manifest: `http://localhost:3000/.well-known/nibgate.json`
