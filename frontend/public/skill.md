---
name: nibgate-sdk
description: Use when integrating, auditing, documenting, or modifying creator-owned paid content flows with the @nibgate/sdk package. Covers installing the package, adding the Nibgate widget, defining resources, protecting server routes, emitting content/unlock events, creating nibgate.json discovery metadata, wiring Circle Gateway/x402 one-time unlocks, and avoiding fake payment or client-only gating patterns.
---

# Nibgate SDK

Use `@nibgate/sdk` in the creator-owned site that actually serves the content. Nibgate Hub verifies the site, indexes public metadata, and records events; the creator site keeps the protected payload and payment receiver logic.

## Install

```bash
npm install @nibgate/sdk
```

Use browser helpers from `@nibgate/sdk` and access enforcement from `@nibgate/sdk/server`:

```ts
import { checkResourceAccess, setupResourcePage, trackResourcePage } from '@nibgate/sdk'
import { createCircleGatewayServer, manifestResponse } from '@nibgate/sdk/server'
```

## Site Widget

Paste the dashboard widget into the verified site layout:

```html
<script async src="https://nibgate.xyz/widget.js"
  data-nibgate-site="site_..."
  data-nibgate-token="ngv_..."
  data-nibgate-api="https://api.nibgate.xyz">
</script>
```

The widget proves ownership and receives browser-side content, view, unlock, receipt, and reputation events. If the widget loads after app code, package events queue and flush when ready.

## Resource Shape

Define one stable resource per paid route, CMS row, media item, file, or API product:

```ts
const resource = {
  id: post.id,
  title: post.title,
  description: post.excerpt,
  type: 'article',
  price: '0.01',
  currency: 'USDC',
  recipient: post.creatorWallet,
  path: `/posts/${post.slug}`,
  url: `https://creator.example/posts/${post.slug}`,
  tags: ['essay', 'research'],
  access: { humans: 'paid', agents: 'paid' },
  unlock: { mode: 'one_time' }
}
```

Allowed public content types are `article`, `image`, `music`, and `video`. Use stable external ids; changing ids breaks continuity for Explore, receipts, and reputation.

## Discovery Metadata

Expose public metadata at `/nibgate.json`:

```ts
import { manifestResponse } from '@nibgate/sdk/server'

export function GET() {
  return manifestResponse({
    origin: process.env.NIBGATE_SITE_ORIGIN,
    resources: [resource]
  })
}
```

Never include the protected payload in `nibgate.json`. It is only for public cards, indexing, and agent-readable discovery.

## Browser Page Wiring

Track the resource page and wire unlock UI:

```ts
import { setupResourcePage, trackResourcePage } from '@nibgate/sdk'

trackResourcePage(resource, { source: 'creator-site' })

setupResourcePage(resource, {
  source: 'creator-site',
  accessPath: '/api/nibgate/access',
  payPath: '/api/nibgate/pay',
  button: '[data-nibgate-unlock]',
  status: '[data-nibgate-status]',
  createPaymentSignature: walletGatewayAdapter.pay
})
```

For custom flows, use `checkResourceAccess(resource, options)` directly. The browser can start checkout and report state, but the server must verify payment and issue unlock proof before returning protected content.

## Server Access Route

Protect paid content in a server route, API handler, middleware, guard, or signed file endpoint:

```ts
import { createCircleGatewayServer } from '@nibgate/sdk/server'

const nibgate = createCircleGatewayServer({
  origin: process.env.NIBGATE_SITE_ORIGIN,
  secret: process.env.NIBGATE_SECRET,
  network: process.env.NIBGATE_PAYMENT_NETWORK || 'eip155:5042002'
})

export function GET(request: Request) {
  return nibgate.accessResponse(request, resource, {
    getContent: async () => new Response(protectedHtml, {
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  })
}
```

The route should return a real `402 Payment Required` challenge until the request has a valid payment proof or signed unlock proof.

## Required Env Vars

Creator site:

```bash
NIBGATE_SITE_ORIGIN=https://creator.example
NIBGATE_SITE_ID=site_...
NIBGATE_SITE_TOKEN=ngv_...
NIBGATE_API_BASE=https://api.nibgate.xyz
NIBGATE_SECRET=server_only_unlock_secret
NIBGATE_PAYMENT_MODE=circle-gateway
NIBGATE_PAYMENT_NETWORK=eip155:5042002
NIBGATE_SELLER_ADDRESS=0xCreatorReceiver
```

Only expose values with `NEXT_PUBLIC_` or client-side env names when they are intentionally public, such as site id, public token, API base, or reputation contract address. Never ship `NIBGATE_SECRET`, private keys, R2 credentials, Resend keys, database URLs, or privileged payment credentials to browser code.

## Payments

For v1, treat `unlock.mode: 'one_time'` with Circle Gateway/x402 as the production path. A Gateway/x402 payment signature is a payment proof. A normal wallet message signature is not payment.

Use `NIBGATE_BUYER_PRIVATE_KEY` only in local demos or controlled tests. In production, the visitor or agent wallet signs/pays the returned `PAYMENT-REQUIRED` challenge.

## Reputation

After a verified unlock, rating UI can submit onchain ratings for the same resource. Reputation-critical inputs should be tied to unlock/payment proof and indexed from chain activity. Page views, scroll depth, and referrers are analytics signals, not trust by themselves.

## Never Do These

- Do not hide paid HTML with CSS or client state after rendering it publicly.
- Do not fake payment ids, receipts, unlocks, or successful access.
- Do not replace Gateway/x402 payment signatures with ordinary wallet message signatures.
- Do not store backend secrets in browser env vars.
- Do not let mutable titles or slugs be the only resource identity.
- Do not expose private content in `nibgate.json`, meta tags, JSON-LD, page source, or static builds.

## Framework Notes

- **Next.js**: use route handlers for `/nibgate.json` and `/api/nibgate/access`; protect content before rendering paid payloads.
- **Express/NestJS**: use middleware, controllers, or guards around protected routes.
- **Astro/SvelteKit/Remix**: use SSR/server routes or endpoints; plain static builds need a protected API or signed URL for private payloads.
- **CMS apps**: save Nibgate resource settings beside each content record, including type, price, currency, receiver wallet, access policy, unlock mode, and discovery preference.
