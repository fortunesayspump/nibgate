# nibgate

Framework-agnostic browser and server package for creator-owned paid content.

## Install

```bash
npm install nibgate
```

Use one package with two entrypoints:

```js
import { gate } from 'nibgate'; // browser/client events and UI helpers
import { createNibgateServer } from 'nibgate/server'; // server-side access enforcement
```

This works with Next.js, React apps with an API backend, Express, NestJS, Remix, SvelteKit, Astro SSR, custom servers, and CMS/plugin environments. Plain HTML can use the widget and browser events, but real gating still requires a server, edge function, API route, or signed file endpoint.

## Usage

First paste the widget script from your Nibgate dashboard into your site:

```html
<script async src="https://nibgate.xyz/widget.js" data-nibgate-site="SITE_ID" data-nibgate-token="PUBLIC_SITE_TOKEN"></script>
```

Then gate content. Nibgate registers the content and reports unlock activity through the widget:

```js
import { gate } from 'nibgate';

const premiumGuide = gate({
  id: 'premium-guide',
  title: 'Premium Guide',
  type: 'article',
  price: '0.01',
  path: '/premium-guide',
  access: {
    humans: 'paid',
    agents: 'paid'
  },
  unlock: {
    mode: 'one_time'
  }
});

premiumGuide.content();
premiumGuide.view();

await premiumGuide.unlock(async () => {
  // Run your payment flow here.
  // Server-side x402/Circle verification should confirm real paid access.
  return {
    paymentId: 'payment_123',
    paymentProvider: 'arc-testnet',
    txHash: '0x...',
    chainExplorerUrl: 'https://testnet.arcscan.app/tx/0x...',
    revenue: 0.01,
    currency: 'USDC'
  };
});
```

Lower-level event helpers are still available when you need them:

```js
import { nibgate } from 'nibgate';

nibgate.unlockCompleted('premium-guide', {
  revenue: 0.01,
  currency: 'USDC'
});
```

The package talks to the widget through `window.nibgateHub`. If your app runs before the async widget finishes loading, events are queued and flushed once the widget is ready.

Content types are `music`, `video`, `article`, and `image`.

## Access policies

For CMS/database-driven sites, keep the gating fields in your own content table, then map each record into a Nibgate resource. Nibgate does not replace your CMS or DB.

If the creator has an admin dashboard, put Nibgate settings in that UI and save them beside the post/content record:

```txt
Nibgate settings
- Publish to Nibgate discovery
- Content type: article / music / image / video
- Human access: free / paid / blocked
- Agent access: free / paid / blocked
- Unlock mode: one_time for the MVP
- Price
- Currency
- Payment receiver
- License or citation terms
```

Example creator DB row:

```js
const post = {
  id: 'post_123',
  slug: 'agent-economy',
  title: 'The agent economy needs native payments',
  price: '0.005',
  humanAccess: 'paid',
  agentAccess: 'paid',
  body: 'Private content stays in your DB.'
};
```

Map it before calling the package:

```js
function postToNibgateResource(post) {
  return {
    id: post.id,
    title: post.title,
    type: 'article',
    price: post.price,
    path: `/blog/${post.slug}`,
    access: {
      humans: post.humanAccess,
      agents: post.agentAccess
    },
    unlock: {
      mode: 'one_time'
    }
  };
}
```

Use `access` to decide who can read the origin payload before payment:

```js
access: {
  humans: 'free' | 'paid' | 'blocked',
  agents: 'free' | 'paid' | 'blocked'
}
```

Examples:

```js
// Humans and agents both need payment proof.
access: { humans: 'paid', agents: 'paid' }

// Humans can read publicly, agents need x402/payment proof to crawl or cite.
access: { humans: 'free', agents: 'paid' }

// Humans can pay, agents cannot access this route.
access: { humans: 'paid', agents: 'blocked' }
```

Real locking must happen on the server. If you render the full protected payload into HTML and hide it with CSS, crawlers can still scrape it. `nibgate/server` is what prevents the protected response from being returned until the request is free, paid with proof, or explicitly allowed by policy.

## Unlock modes

The MVP unlock is intentionally simple:

```txt
pay once -> verify receipt/proof -> issue unlock token -> serve content -> report receipt
```

Use this today:

```js
unlock: {
  mode: 'one_time'
}
```

The resource shape already has room for future unlock modes, but they should not be presented as production-ready until the payment/session adapters exist:

```js
unlock: { mode: 'metered_stream', unit: 'second', pricePerUnit: '0.0001' }
unlock: { mode: 'metered_read', unit: 'paragraph', pricePerUnit: '0.00005' }
unlock: { mode: 'time_pass', duration: '24h' }
unlock: { mode: 'agent_quota', maxReads: 20 }
```

Those later modes let Nibgate grow into background video/audio streaming payments, partial article reads, time passes, and agent usage quotas without changing the one-package architecture.

## Server protection

Use `nibgate/server` for real route protection. The server layer creates x402-style payment challenges, verifies your payment receipt, and issues a short-lived Nibgate unlock token for the route.

```js
import { createNibgateServer } from 'nibgate/server';

const nibgateServer = createNibgateServer({
  secret: process.env.NIBGATE_SECRET,
  origin: 'https://creator.example',
  recipient: process.env.NIBGATE_SELLER_ADDRESS,
  async verifyPayment({ resource, payment }) {
    // Plug Circle/x402 verification here.
    return Boolean(payment.paymentId);
  }
});

export const GET = nibgateServer.protect({
  id: 'premium-guide',
  title: 'Premium Guide',
  type: 'article',
  price: '0.01',
  path: '/premium-guide',
  access: {
    humans: 'paid',
    agents: 'paid'
  },
  unlock: {
    mode: 'one_time'
  }
}, async () => {
  return new Response('Premium content');
});
```

The browser `gate(...)` API gives creators the simple unlock UX. The server API is what should enforce real paid access.

Payments are non-custodial in the Nibgate model. The receiving address belongs to the creator site/package config, and different sites can use different receiving addresses. Nibgate Hub records paid unlock events and payment metadata; it does not hold funds or provide withdrawals.

## Payment receipts

Nibgate supports two receipt paths for the current product direction:

- `circle-gateway`: store the Circle payment id and a `receiptUrl` only when Circle or your gateway layer returns a real public/internal receipt URL.
- `arc-testnet`: store the Arc transaction hash and optional `chainExplorerUrl`, usually an Arcscan transaction URL.

Do not fabricate gateway receipt URLs. If no provider receipt URL exists, send the payment id/hash and Nibgate will show the recorded payment with the best available explorer link.

## Local demo

The repo includes a plain Express creator site that uses the package without any framework adapter:

```bash
npm run dev:demo
```

The demo imports `nibgate/server`, serves the browser client locally, registers article/music/image/video content, and protects `/articles/premium-agent-economy`.

It also includes local routes for database/custom CMS, MDX/frontmatter, headless CMS, static teaser/protected API, media/file, and agent/API publishing styles under `/examples`.

Real unlocks are fail-closed. Set these env vars before using the local Gateway payment button:

```bash
NIBGATE_PAYMENT_MODE=circle-gateway
NIBGATE_SELLER_ADDRESS=0xYourSellerAddress
NIBGATE_BUYER_PRIVATE_KEY=0xYourFundedBuyerPrivateKey
```

Without a real Gateway payment, the server will not issue a Nibgate unlock token.
