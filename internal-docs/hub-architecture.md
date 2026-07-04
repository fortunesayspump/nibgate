# Nibgate Hub Architecture

Nibgate has a widget-first architecture on purpose.

## Source of Truth

### Creator site

The creator site remains the source of truth for:

- content
- routes
- pricing
- payout wallet
- unlock logic
- origin responses

### Multipublisher platform

A verified platform can also be the source of truth for many creator routes:

- platform domain and widget token
- publisher profiles such as `platform.com/@alice`
- post routes and metadata
- per-publisher payout wallets
- publisher wallet verification state

In this model, the platform owns the verified site. The creator owns a publisher identity inside that site.

### Nibgate hub

The hub remains the source of truth for:

- connected sites
- publisher identities under connected platform sites
- verification state
- indexed resource metadata
- aggregated views
- unlock counts
- revenue metrics
- public discovery pages

That means the hub does not need to store full article bodies or duplicate entire creator sites. It only needs enough metadata and event history to make discovery and analytics work.

## Widget-first contract

The creator setup should stay simple:

1. register a site in the Hub
2. paste one widget script into the creator site
3. install/use the Nibgate package for gating content
4. let the package call the widget bridge when content is registered, viewed, unlocked, or paid for

```txt
Package -> window.nibgateHub -> Widget -> POST /api/hub/track -> Dashboard
```

The package should not require creators to configure backend routes or private secrets in normal browser usage. The widget owns the browser-safe site id, public token, visitor id, session id, URL, path, referrer, and transport details.

For multipublisher platforms, the widget remains site-level. Publisher attribution is carried by each resource/event.

## Package contract

Every site that installs `@nibgate/sdk` should be able to:

1. protect local routes and gated content
2. handle x402 payment/unlock logic on the creator origin
3. load the Hub widget script for verification and browser-side analytics
4. register content metadata for `music`, `video`, `article`, and `image`
5. emit structured events to the widget/runtime bridge when content is viewed, unlocked, or paid for

Every multipublisher platform should also be able to:

1. create publisher identities for creators under the verified platform site
2. link publisher identities to wallets using platform-attested or wallet-verified claims
3. include `publisher` metadata on every resource
4. route payments to the resource `recipient`
5. let Nibgate attribute content, receipts, metrics, and reputation to the wallet-linked publisher account

## Hub widget

The creator dashboard generates a script like:

```html
<script
  async
  src="https://nibgate.xyz/widget.js"
  data-nibgate-site="SITE_ID"
  data-nibgate-token="PUBLIC_SITE_TOKEN"
></script>
```

The widget should:

- prove the creator controls the domain
- automatically record page views per route
- detect individual resources from `data-nibgate-*` attributes or `nibgate:*` meta tags
- expose `window.nibgateHub.registerContent(...)`, `window.nibgateHub.track(...)`, and unlock/payment helpers for the package runtime
- send events to `POST /api/hub/track`

The widget is intentionally engine-agnostic. It can be pasted into plain HTML, Next.js, Astro, Vite, SvelteKit, Nuxt, Webflow-style exports, Rails, Django, Express, or any custom site that can render a script tag.

## Verification

The hub connects to a site first, then returns:

- `siteId`
- `verifyToken`

The dashboard displays the widget snippet. The hub later verifies ownership by fetching the creator homepage and checking that the widget script is present with the expected `siteId` and public token.

The public token is allowed to be visible in browser code. It identifies a verified site for event ingestion; it does not grant account access or expose private dashboard data.

For platforms, the public token proves only that `platform.com` can stream events. It does not prove Alice owns the platform. Alice's claim comes from a publisher identity linked to the same wallet she uses on the platform and on Nibgate.

## Publisher identity

The publisher layer sits between a verified site and content.

```txt
Website(platform.com)
  -> Publisher(@alice, wallet 0xAlice)
    -> Content(post_123)
```

Resource shape:

```js
{
  id: post.id,
  title: post.title,
  type: 'article',
  price: post.price,
  recipient: post.author.walletAddress,
  path: `/@${post.author.handle}/${post.slug}`,
  url: `${origin}/@${post.author.handle}/${post.slug}`,
  publisher: {
    id: post.author.id,
    handle: post.author.handle,
    walletAddress: post.author.walletAddress,
    profileUrl: `${origin}/@${post.author.handle}`,
    verification: 'wallet_verified'
  }
}
```

Dashboard ownership rule:

- owned sites are domains the wallet/account verified directly
- publisher identities are routes/profiles the wallet claimed inside a verified platform
- a creator should see `platform.com/@alice` when the platform publisher wallet matches the wallet used to sign into Nibgate

Trust modes:

- `platform_attested`: the verified platform asserts that a publisher exists and owns a post
- `wallet_verified`: the publisher wallet signs a SIWE-style claim for that platform profile
- `subdomain_publisher`: a future stronger mode where `alice.platform.com` can be treated as a publisher route, with extra DNS/TLS complexity

## Events

The widget automatically emits:

- `page_view`
- `resource_view` when resource metadata is present on the page

The package or runtime can emit events such as:

- `content_registered`
- `resource_view`
- `unlock_started`
- `unlock_completed`
- `payment_completed`

These are intentionally small and metadata-oriented. They should describe what happened without sending the creator's full private content to the hub.

Platform events should include publisher metadata when available. The backend should store publisher id/wallet on content, metrics, receipts, and ratings so platform-level analytics and creator-level analytics can both be correct.

Example package bridge:

```js
import { gate } from '@nibgate/sdk';

const premiumGuide = gate({
  id: "premium-guide",
  title: "Premium Guide",
  type: "article",
  price: "0.01",
  path: "/premium-guide"
});

premiumGuide.content();

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

Lower-level bridge calls remain available for custom runtimes:

```js
import { nibgate } from '@nibgate/sdk';

nibgate.unlockCompleted("premium-guide", {
  revenue: 0.01,
  currency: "USDC"
});
```

The backend normalizes content types to exactly four values: `music`, `video`, `article`, and `image`.

## Server protection

The public package also exposes `@nibgate/sdk/server` for the paid-access layer. This is the part that should enforce real unlocks. The browser `gate(...)` API is for UX and automatic reporting; server protection decides whether protected content is actually returned.

```js
import { createNibgateServer } from '@nibgate/sdk/server';

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

`protect(...)` returns a `402 Payment Required` challenge until a valid signed Nibgate unlock token is present. Circle/x402 verification plugs into `verifyPayment(...)`, and successful unlocks can then be reported through the widget/package bridge.

## Earnings model

Nibgate earnings are recorded paid unlock events, not a custodial balance.

Payment flow:

```txt
Buyer -> x402/Circle payment -> creator site receiving address
```

Hub data flow:

```txt
Creator site package -> widget/backend event -> Nibgate earnings dashboard
```

The receiving address belongs to the creator site/package config. A single creator profile can connect multiple sites, and each site can use a different recipient address. Historical payment records should store the recipient used for that exact unlock, because a creator may change a site's receiver later.

On a multipublisher platform, the receiving address should usually be resource-level and match the publisher wallet. If a platform supports delegated payout wallets, the relationship must be explicit so Nibgate can attribute reputation to the publisher while showing the correct payment receiver.

The earnings UI should show recorded revenue, receiving addresses by site, payment verification status, revenue by site/content, and payment history. It should not show withdrawals unless Nibgate later becomes custodial.

Receipt model:

- Circle Gateway is a provider/gateway receipt path. Store `paymentProvider: "circle-gateway"`, `paymentId`, and `receiptUrl` when the integration returns a real receipt URL.
- Arc testnet is the on-chain receipt path. Store `paymentProvider: "arc-testnet"`, `txHash`, `chainId`, and `chainExplorerUrl` when available.
- The dashboard must never hardcode fake gateway receipt URLs. It should prefer `receiptUrl`, fall back to `chainExplorerUrl` or an Arcscan transaction URL, then fall back to the recorded payment id/hash.

## Current repo state

This repo now includes:

- package-side hub helpers in `packages/cli/src/core/hub.js`
- hub widget served from `frontend/public/widget.js`
- hub API endpoints for site registration, widget verification, and event ingestion
- **Prisma ORM** for persistent, strongly-typed storage of users, sessions, and indexed content.
- **SIWE Authentication** (Sign-In with Ethereum) for Creators to manage their sites.

## Production note

The hub uses Prisma with PostgreSQL in production. For the current deployment plan, point `DATABASE_URL` at the Railway Postgres connection string attached to the backend service.
