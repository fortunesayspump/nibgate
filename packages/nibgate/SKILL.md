---
name: nibgate-sdk
description: Complete guide for integrating @nibgate/sdk into a creator-owned site. Covers widget installation, resource definition, server gating, payments (Circle Gateway/x402 on Arc Testnet), browser unlock UI, admin panel for managing gating settings, onchain reputation/ratings, manifest/discovery metadata, and common gotchas.
---

# Nibgate SDK

Use `@nibgate/sdk` in the creator-owned site that serves the content. The Nibgate Hub verifies the site, indexes public metadata, and records events. The creator site keeps the protected payload, payment receiver logic, and admin configuration.

## Install

```bash
npm install @nibgate/sdk
```

## Agent Handoff

When an AI agent is helping install Nibgate, give it this file first:

- package copy: `node_modules/@nibgate/sdk/SKILL.md`
- public copy: `https://nibgate.xyz/skill.md`

Read this entire file before editing any routes or checkout code. The guide follows the full integration order.

---

## 1. Site Widget (Analytics & Ownership Proof)

Paste the dashboard widget into the verified site layout:

```html
<script async src="https://nibgate.xyz/widget.js"
  data-nibgate-site="site_..."
  data-nibgate-token="ngv_..."
  data-nibgate-api="https://api.nibgate.xyz">
</script>
```

**The widget is ONLY for analytics.** It proves domain ownership, detects resources from `data-nibgate-resource` attributes or meta tags, tracks page views, scroll depth, and time spent. It does NOT pop up a wallet or handle checkout. Wallet/payment logic comes from the SDK browser helpers.

If the widget loads after app code, the SDK queues events and flushes them when the widget is ready.

---

## 2. Resource Shape

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

Allowed types: `article`, `image`, `music`, `video` (aliases like `audio→music`, `photo→image` are normalized). Use stable IDs — changing IDs breaks continuity for Explore, receipts, and reputation.

**Important:** The `image`, `description`, and `title` fields become the public thumbnail and card copy on the Explore page. Use a teaser preview, not the actual paid file.

---

## 3. Discovery Metadata (nibgate.json)

Expose public metadata at `/nibgate.json` so the Hub can index your content:

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

---

## 4. Server Access Route (Payment Challenge & Unlock)

Protect paid content in a server route, API handler, or middleware:

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

**How `accessResponse` works:**
1. Checks for an existing unlock proof via `x-nibgate-payment-proof` header
2. If valid → returns content (200)
3. If not and `humans: 'blocked'` → returns 403
4. If not and `humans: 'paid'` → returns a `402 Payment Required` challenge with the creator's wallet, price, and network
5. If the request has a `payment-signature` header AND `NIBGATE_PAYMENT_MODE=circle-gateway` is set → verifies the payment and returns unlock proof + content

**The `accessPath` is queried exactly as-is.** The SDK does not auto-append `?id=` or route params. If your access route needs a content identifier, include it in the path (e.g., `/api/nibgate/access/my-content-id`) or pass it as a query param in the resource's `accessPath` field.

**Custom backends:** If you build your own access route instead of using `accessResponse()`, your route must:
- Return 402 with the challenge JSON when no payment proof is present
- Check for `payment-signature` header — if present and valid, return 200 with `{ ok: true, unlockProof: "...", payment: {...} }`
- Check for `x-nibgate-payment-proof` header — if present and valid, return 200 with the protected content

---

## 5. Browser Page Wiring (Unlock UI)

Track the resource page and wire the unlock button:

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

For the browser wallet checkout flow (user signs with MetaMask):

```ts
import { createEvmGatewayUnlock } from '@nibgate/sdk'

createEvmGatewayUnlock(resource, {
  accessPath: '/api/nibgate/access',
  unlockButton: '#unlock-btn',
  status: '#status',
  connectButton: '#connect-btn'
})
```

The browser flow:
1. `checkResourceAccess()` calls the access route
2. If 402 → prompts wallet to sign the Gateway payment
3. Sends signature back to access route
4. Server verifies and returns unlock proof
5. Proof stored in localStorage → subsequent requests include it as `x-nibgate-payment-proof`

For custom flows, use `checkResourceAccess(resource, options)` directly.

---

## 6. Server-Side Pay Route (Alternative to Browser Wallet)

For testing or server-driven payments, add a pay endpoint that uses the server's buyer key:

```ts
import { nibgateServer } from './nibgate-resource'

export function POST({ request }) {
  return nibgateServer.payAndUnlockResponse(request, resource, {
    origin: process.env.NIBGATE_SITE_ORIGIN,
    accessPath: '/api/nibgate/access'
  })
}
```

This requires `NIBGATE_BUYER_PRIVATE_KEY` to be set. In production, prefer browser wallet checkout so the user pays from their own wallet.

---

## 7. Admin Panel (Manage Gating Settings From Your Site)

The SDK ships a ready-to-use admin panel that lets creators manage gating, pricing, and settings from the creator's own site instead of editing code.

### Setup

```ts
import { createFileStore, createAdminApi } from '@nibgate/sdk/server'
import express from 'express'

const store = createFileStore({ path: './nibgate-settings.json' })
const admin = createAdminApi({ store })

const app = express()
app.use(express.json())

// Mount admin API routes (list, get, update, delete resource settings)
app.use(admin.router(express))

// Or use individual handlers for non-Express frameworks:
// app.get('/admin/nibgate/resources', admin.handleList)
// app.post('/admin/nibgate/resources/:id', admin.handleUpdate)
```

### Protect the admin route

Pass an `authorize` function to `createAdminApi`:

```ts
const admin = createAdminApi({
  store,
  authorize: (req) => {
    // Check session, API key, admin token, etc.
    return req.headers['x-admin-key'] === process.env.ADMIN_KEY
  }
})
```

### Using settings in your resource definitions

The admin panel stores per-resource settings. Build resource objects from stored settings:

```ts
import { settingsToAccessPolicy, settingsToUnlockPolicy } from '@nibgate/sdk/server'

function getResource(id) {
  const settings = store.get(id) || {}
  return {
    id,
    title: settings.title || post.title,
    type: settings.type || 'article',
    price: settings.price || '0.01',
    currency: settings.currency || 'USDC',
    recipient: settings.recipient || process.env.NIBGATE_SELLER_ADDRESS,
    access: settingsToAccessPolicy(settings),
    unlock: settingsToUnlockPolicy(settings),
    ratingsEnabled: settings.ratingsEnabled !== false
  }
}
```

### Admin page

Visit `/admin/nibgate` in your browser. The page shows all configured resources with controls for:
- Human access (free / paid / blocked)
- Agent access (free / paid / blocked)
- Unlock mode
- Payment rail
- Price & currency
- Recipient wallet
- Ratings toggle
- Content type
- Publish to discovery toggle

---

## 8. Payments (Circle Gateway / x402 on Arc Testnet)

For v1, treat `unlock.mode: 'one_time'` with Circle Gateway/x402 as the production path. All payments settle on Arc Testnet (chain ID 5042002) in USDC.

### How payment works

1. Browser requests access → server returns 402 challenge with creator's wallet, price, network
2. Browser prompts user to sign a Gateway payment payload (EIP-712 typed data via `eth_signTypedData_v4`)
3. Signed payload sent to server as `payment-signature` header
4. Server verifies with `createGatewayMiddleware` from `@circle-fin/x402-batching/server`
5. On success, server creates an HMAC-signed unlock token and returns it
6. Browser stores the token as `x-nibgate-payment-proof` for subsequent requests

### Before testing locally

Deposit testnet USDC from your wallet into the Gateway facilitator so transactions can settle:

```bash
npx nibgate deposit 10
```

Check your Gateway balance:

```bash
npx nibgate balance
```

### Env vars

```bash
NIBGATE_PAYMENT_MODE=circle-gateway
NIBGATE_PAYMENT_NETWORK=eip155:5042002
NIBGATE_SELLER_ADDRESS=0xCreatorReceiver
NIBGATE_BUYER_PRIVATE_KEY=0x...   # Only for local testing
```

### Important

- A Gateway/x402 payment signature is a valid payment proof. A normal wallet message signature (`eth_sign` / `personal_sign`) is NOT payment — do not accept it.
- Use `NIBGATE_BUYER_PRIVATE_KEY` only in local demos. In production, the visitor or agent wallet signs the payment challenge.
- The `NIBGATE_SECRET` used by `createNibgateServer()` MUST match the secret used by your access and pay routes. If they diverge, unlock tokens signed by one route fail verification on the other. Set once, use everywhere.

### For plain HTML/JS sites without a bundler

The SDK relies on bare module imports (`viem`, `@x402/core`). These won't work in the browser without a bundler. Compile a browser-ready bundle:

```bash
esbuild --bundle --format=iife --global-name=Nibgate \
  --outfile=nibgate-bundle.js \
  node_modules/@nibgate/sdk/src/browser/index.js
```

Then load it:

```html
<script src="/nibgate-bundle.js"></script>
<script>
  const { nibgate, gate } = Nibgate
</script>
```

### Smart Contract Wallets

Some smart contract wallets (Gnosis Safe, Argent, etc.) may not support `eth_signTypedData_v4` required by the Gateway payment signing. Test with an EOA (MetaMask, Rabby, Coinbase Wallet) first. If your users primarily use smart contract wallets, use the server-side pay route (`payAndUnlockResponse`) with `NIBGATE_BUYER_PRIVATE_KEY` instead.

---

## 9. Onchain Reputation & Ratings

After a verified unlock, users can rate content onchain via the `NibgateReputation.sol` contract deployed on Arc Testnet.

### How it works

1. User unlocks content (has a valid unlock proof)
2. rating UI calls `rateContentOnchain(resource, { rating, paymentId })`
3. User signs an onchain transaction with their rating
4. Transaction indexed by Nibgate's reputation indexer (polls every 30s)
5. Rating contributes to content/creator reputation scores on Explore and leaderboards

### Browser rating UI

```ts
import { createOnchainRating } from '@nibgate/sdk'

createOnchainRating(resource, {
  ratingButtons: '[data-rating]',
  status: '#rating-status',
  payment: latestPayment  // from the unlock result
})
```

Or buttons with `data-nibgate-rating-value="4"` attributes. Ratings are 1-5.

### Reputation requirements

- Only ratings from wallets that have an unlock receipt for the same content are counted
- Ratings are onchain (requires gas on Arc Testnet)
- Content reputation (0-5 stars) and creator reputation (0-100 score) update after indexing

---

## 10. Hardcoded Or File-Based Content

Hardcoded content, MDX files, Markdown files, static JSON files, and repo-local media can be gated when the protected payload stays server-side until access is allowed.

**Safe pattern:**
1. Keep the public teaser, title, price, and metadata in the page
2. Keep the full paid body in a server-only module, route handler, CMS fetch, DB row, private file, or signed URL endpoint
3. Run `accessResponse()`, `accessFor()`, middleware, or a framework guard before returning the full payload

**Unsafe pattern (will not protect your content):**
- Rendering the paid body into public HTML and hiding it with CSS
- Bundling the paid body into client JavaScript
- Putting private text into `nibgate.json`, JSON-LD, meta tags, page source, or static exports
- Exposing an open API route that returns the protected body without checking payment proof

---

## 11. Required Env Vars

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

Only expose values with `NEXT_PUBLIC_` or client-side env names when they are intentionally public (site id, public token, API base, reputation contract address). Never ship `NIBGATE_SECRET`, private keys, R2 credentials, Resend keys, database URLs, or privileged payment credentials to browser code.

---

## 12. Common Gotchas

- **Widget is only for analytics.** It does not pop up wallets or handle checkout. Use the SDK browser helpers for that.
- **accessPath is literal.** The SDK does not append `?id=` or route params. Include identifiers in the path or query string manually.
- **Custom backends must handle `payment-signature` header.** If you build your own access route without `accessResponse()`, your route must detect `payment-signature` header and return 200 on valid proof, not 402.
- **Cookie `[object Object]` bug.** The unlock proof must be a string (the token from `createUnlockToken`), not an object. `storePaymentProof` now handles both, but ensure your server returns `unlockProof` as a string.
- **Secrets must match.** `NIBGATE_SECRET` must be the same in `createNibgateServer()`, the access route, and the pay route. Mismatch causes unlock tokens to fail verification silently.
- **Smart contract wallets** may not support `eth_signTypedData_v4`. Use an EOA or the server-side pay route.
- **Wallet extension conflicts** can cause signature corruption if multiple wallets are installed. Advise users to disable other wallet extensions when testing.
- **Deposit before testing locally.** Run `npx nibgate deposit 10` to fund the Gateway facilitator balance.

---

## 13. Never Do These

- Do not hide paid HTML with CSS or client state after rendering it publicly
- Do not fake payment IDs, receipts, unlocks, or successful access
- Do not replace Gateway/x402 payment signatures with ordinary wallet message signatures
- Do not store backend secrets in browser env vars
- Do not let mutable titles or slugs be the only resource identity
- Do not expose private content in `nibgate.json`, meta tags, JSON-LD, page source, or static builds

---

## 14. Framework Notes

- **Next.js**: Use route handlers for `/nibgate.json` and `/api/nibgate/access`. Protect content before rendering paid payloads. Use `server-only` for private modules.
- **Express/NestJS**: Use middleware, controllers, or guards around protected routes. Mount the admin router at `/admin/nibgate`.
- **Astro/SvelteKit/Remix**: Use SSR/server routes or endpoints. Plain static builds need a protected API or signed URL for private payloads.
- **CMS apps**: Save Nibgate resource settings beside each content record. Use `settingsToAccessPolicy()` and `settingsToUnlockPolicy()` to convert stored settings to resource shapes. Mount the admin panel for easy management.
- **Static/vanilla HTML/JS**: Compile the SDK into a bundle with esbuild (see section 8). Use `gate()` and `nibgate` from the global `Nibgate` namespace.
