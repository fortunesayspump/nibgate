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
<script async src="https://www.nibgate.xyz/widget.js"
  data-nibgate-site="site_..."
  data-nibgate-token="ngv_..."
  data-nibgate-api="https://api.nibgate.xyz">
</script>
```

**The widget is ONLY for analytics.** It proves domain ownership, detects resources from `data-nibgate-resource` attributes or meta tags, tracks page views, scroll depth, and time spent. It does NOT pop up a wallet or handle checkout. Wallet/payment logic comes from the SDK browser helpers.

If the widget loads after app code, the SDK queues events and flushes them when the widget is ready.

**Adblocker bypass:** The widget now sends events to `/api/hub/evt` instead of `/api/hub/track` to avoid adblocker filter lists that target the word "track". The old `/api/hub/track` endpoint is preserved for backward compatibility. If you self-host the backend, ensure both routes are registered.

**Hosted mode (zero backend code):** If you don't want to run your own access route, mark premium content with a data attribute and the widget handles everything:

```html
<div data-nibgate-premium="0.01" data-nibgate-recipient="0xYourWallet">
  <p>Teaser text shown to everyone...</p>
  <div data-nibgate-unlock-card>
    <span data-nibgate-wallet-label>No wallet</span>
    <button data-nibgate-connect>Connect</button>
    <button data-nibgate-unlock-btn>Unlock for 0.01 USDC</button>
    <p data-nibgate-status></p>
  </div>
  <div data-nibgate-unlocked hidden>
    Full premium content here...
  </div>
</div>
```

No SDK import, no server access route, no env vars. The default wallet is set once in the Nibgate dashboard — or override per-post with `data-nibgate-recipient`. Custom price per-post: change `data-nibgate-premium="0.05"`.

---

## 2. Resource Shape (Minimal)

The SDK auto-derives most fields from meta tags and defaults. You only need:

```ts
const resource = {
  id: post.id,
  title: post.title,       // auto-fallsback to og:title → document.title
  path: `/posts/${post.slug}`,
  price: '0.01'            // sets access: { humans: 'paid', agents: 'paid' } automatically
}
```

The rest fills in automatically from your page's HTML:
- `url` from `window.location.origin + path`
- `type` from `<meta property="og:type">` (defaults to `article`)
- `imageUrl` from `<meta property="og:image">`
- `description` from `<meta property="og:description">` → `<meta name="description">`
- `tags` from `<meta name="keywords">`
- `currency` defaults to `USDC`
- `access` defaults to `paid` when `price > 0`, otherwise `free`
- `recipient` is optional (server's 402 challenge provides the real wallet)

Allowed types: `article`, `image`, `music`, `video`, `document` (aliases like `audio→music`, `photo→image` are normalized). Use stable IDs — changing IDs breaks continuity for Explore, receipts, and reputation.

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

**After successful gateway payment, `accessResponse` automatically emits `payment_completed` and `unlock_completed` events to the Hub** (via `emitHubEvent`). This requires `NIBGATE_SITE_ID`, `NIBGATE_SITE_TOKEN`, and `NIBGATE_API_BASE` to be set — see [Required Env Vars](#11-required-env-vars). Without those, the payment still processes and the unlock proof is returned, but unlock counts and revenue on the Hub will not update.

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

### Postgres store

For production (Render, Railway, Fly), use the Postgres store instead of the file store (file changes get wiped on redeploy):

```ts
import pkg from 'pg'
const { Pool } = pkg

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const store = createPostgresStore(pool, { table: 'nibgate_settings' })
const admin = createAdminApi({ store })
```

The Postgres store auto-creates the table. It uses JSONB for settings and `ON CONFLICT` upserts. Works with any `pg` Pool-like interface.

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

For plain HTML/JS sites without a bundler, use the pre-built CDN bundle:

```html
<script src="https://unpkg.com/@nibgate/sdk/dist/nibgate.min.js"></script>
<script>
  const { nibgate, createGate, mountRatingUI, createEvmGatewayUnlock, createOnchainRating } = Nibgate
</script>
```

The bundle includes all dependencies (viem, x402) compiled into a single IIFE script. All browser exports are on the `Nibgate` global. No esbuild step needed.

If you prefer to build your own bundle:

```bash
esbuild --bundle --format=iife --global-name=Nibgate \
  --outfile=nibgate-bundle.js \
  node_modules/@nibgate/sdk/src/browser/index.js
```

### Smart Contract Wallets

Some smart contract wallets (Gnosis Safe, Argent, etc.) may not support `eth_signTypedData_v4` required by the Gateway payment signing. Test with an EOA (MetaMask, Rabby, Coinbase Wallet) first. If your users primarily use smart contract wallets, use the server-side pay route (`payAndUnlockResponse`) with `NIBGATE_BUYER_PRIVATE_KEY` instead.

---

## 9. AI Agent Content Discovery & Purchase (x402)

AI agents can discover and purchase content on Nibgate through the same x402 protocol used by browser wallets — no browser, HTML, or widget needed.

### Agent Flow

1. **Discover** — agent hits the Hub's explore API or polls creator `/nibgate.json` manifests:

   ```bash
   GET https://nibgate.xyz/api/hub/explore/content?type=article&limit=100
   Accept: application/json
   ```

   Response includes content with `price`, `currency`, `access` policy, `websiteDomain`, and the creator's `recipientWallet`.

2. **Access** — agent hits the content's access URL identifying as an agent:

   ```bash
   GET https://creator.example/api/nibgate/access?path=my-article
   x-nibgate-actor: agent
   Accept: application/json
   ```

3. **402 Challenge** — if payment is required, server returns HTTP 402 with a `PAYMENT-REQUIRED` header containing a base64-encoded x402 v2 challenge with the `extra.verifyingContract` field (Gateway Wallet address).

4. **Sign Payment** — agent signs an EIP-3009 `TransferWithAuthorization` using an EVM wallet with USDC in Circle Gateway:

   ```ts
   import { BatchEvmScheme } from '@circle-fin/x402-batching/client'
   import { privateKeyToAccount } from 'viem/accounts'

   const wallet = privateKeyToAccount('0x...')
   const scheme = new BatchEvmScheme(wallet)
   const payload = await scheme.createPaymentPayload(2, gatewayOption)
   ```

5. **Retry** — agent retries the request with the signed payment:

   ```bash
   GET https://creator.example/api/nibgate/access?path=my-article
   payment-signature: <base64 payload>
   Accept: application/json
   ```

6. **Unlocked** — server returns `200` with `{ ok: true, unlockProof, payment, resource }`.

### Headless GatewayClient (Full Auto Flow)

The `GatewayClient` from `@circle-fin/x402-batching/client` handles steps 3-5 automatically:

```ts
import { GatewayClient } from '@circle-fin/x402-batching/client'

const agent = new GatewayClient({
  chain: 'arcTestnet',
  privateKey: '0x...',
  rpcUrl: 'https://rpc.testnet.arc.io'
})

const result = await agent.pay('https://creator.example/api/nibgate/access?path=my-article', {
  headers: { 'x-nibgate-actor': 'agent' }
})
// { data: { ok: true, unlockProof, ... }, formattedAmount: '0.01', transaction: '0x...' }
```

### Agent Wallet Requirements

- **USDC in Circle Gateway** on Arc Testnet (chain ID 5042002) — `agent.deposit('10')` moves USDC from wallet → Gateway
- **Gas** — on Arc Testnet the native token IS USDC, so the wallet needs USDC for both Gateway deposits and transaction fees
- **Private key** — must be accessible to the agent process (env var, secure store, or derived from a mnemonic)

### Agent Identification

Agents identify themselves via headers (in priority order):

| Header | Value | Detected When |
|--------|-------|---------------|
| `x-nibgate-actor` | `agent` | Explicit agent declaration |
| `Accept` + `x402` | `application/json` + `true` | Accept header includes JSON and x402 is set |
| `User-Agent` | bot pattern | Matches `/bot|agent|llm|gpt|claude|perplexity/i` |

### Agent-Specific Pricing

Creators can set different prices for humans and agents in the resource's `access` policy:

```ts
const resource = {
  access: { humans: 'free', agents: 'paid' },    // agents pay, humans free
  price: '0.002',
  // or
  access: { humans: 'paid', agents: 'paid' },    // both pay
  // or
  access: { humans: 'paid', agents: 'blocked' },  // agents blocked entirely
}
```

### Stress Test Script

The repo includes a stress test script at `demo/stress-test-agents.mjs` that simulates N agents discovering content from the Hub and purchasing via x402:

```bash
node demo/stress-test-agents.mjs \
  --mnemonic "twelve word seed phrase here" \
  --agents 50 --concurrency 10 \
  --hub-url "https://nibgate.xyz" \
  --access-template "https://{origin}/api/nibgate/access?path={path}" \
  --fund --fund-amount 5 \
  --loop --interval 300
```

The script:
- Derives deterministic wallets from the mnemonic (wallet[0] = master, wallet[1..N-1] = agents)
- Discovers content from the Hub explore API or from manifests
- Filters for agent-purchasable content (paid, not blocked, valid recipient)
- Funds agents from master via native USDC transfer + Gateway deposit (`--fund`)
- Purchases content via `GatewayClient.pay()` (full x402 auto flow)
- Reports per-agent results with aggregate stats
- Continues on loop with configurable interval

---

## 10. Onchain Reputation & Ratings

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

## 11. Hardcoded Or File-Based Content

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

## 12. Required Env Vars

```bash
NIBGATE_SITE_ORIGIN=https://creator.example
NIBGATE_SITE_ID=site_...             # Hub website UUID — required for emitHubEvent to report unlocks
NIBGATE_SITE_TOKEN=ngv_...           # Hub website verify token — required for emitHubEvent
NIBGATE_API_BASE=https://nibgate.xyz # Hub API base — required for emitHubEvent
NIBGATE_SECRET=server_only_unlock_secret
NIBGATE_PAYMENT_MODE=circle-gateway
NIBGATE_PAYMENT_NETWORK=eip155:5042002
NIBGATE_SELLER_ADDRESS=0xCreatorReceiver
```

**Without `NIBGATE_SITE_ID` and `NIBGATE_SITE_TOKEN`**, `accessResponse()` still processes x402 payments and returns unlock proofs, but `payment_completed` and `unlock_completed` events are NOT sent to the Hub. Unlock counts, revenue, and volume on Explore and leaderboards will not update. Set these to enable automatic event reporting after every successful gateway purchase.

Only expose values with `NEXT_PUBLIC_` or client-side env names when they are intentionally public (site id, public token, API base, reputation contract address). Never ship `NIBGATE_SECRET`, private keys, R2 credentials, Resend keys, database URLs, or privileged payment credentials to browser code.

---

## 13. Common Gotchas

- **Widget is only for analytics.** It does not pop up wallets or handle checkout. Use the SDK browser helpers for that.
- **accessPath is literal.** The SDK does not append `?id=` or route params. Include identifiers in the path or query string manually.
- **Custom backends must handle `payment-signature` header.** If you build your own access route without `accessResponse()`, your route must detect `payment-signature` header and return 200 on valid proof, not 402.
- **Cookie `[object Object]` bug.** The unlock proof must be a string (the token from `createUnlockToken`), not an object. `storePaymentProof` now handles both, but ensure your server returns `unlockProof` as a string.
- **Secrets must match.** `NIBGATE_SECRET` must be the same in `createNibgateServer()`, the access route, and the pay route. Mismatch causes unlock tokens to fail verification silently.
- **Unlock events need three env vars.** `accessResponse()` emits `payment_completed` and `unlock_completed` to the Hub after gateway payment, but only if `NIBGATE_SITE_ID`, `NIBGATE_SITE_TOKEN`, and `NIBGATE_API_BASE` are set. Without them, the x402 payment still works and the unlock proof is returned, but unlock counts and volume on Explore will not update.
- **Smart contract wallets** may not support `eth_signTypedData_v4`. Use an EOA or the server-side pay route.
- **Wallet extension conflicts** can cause signature corruption if multiple wallets are installed. Advise users to disable other wallet extensions when testing.
- **Deposit before testing locally.** Run `npx nibgate deposit 10` to fund the Gateway facilitator balance.

---

## 14. Webhooks (Server-to-Server Notifications)

Receive notifications when payments, unlocks, or ratings happen — without polling.

### Setup

```ts
import { createWebhookManager, createWebhookApi } from '@nibgate/sdk/server'
import express from 'express'

const manager = createWebhookManager({
  webhookUrl: 'https://my-server.com/nibgate-webhook',
  webhookSecret: process.env.NIBGATE_WEBHOOK_SECRET
})

// Mount admin API for subscribing webhooks
const webhookApi = createWebhookApi(manager, { adminKey: process.env.ADMIN_KEY })
app.use(webhookApi.router(express))

// Emit events from your code
await manager.emit('payment.completed', { contentId: 'post-1', amount: '0.01', payer: '0x...' })
await manager.emit('content.unlocked', { contentId: 'post-1', actor: 'human' })
await manager.emit('content.rated', { contentId: 'post-1', rating: 4, rater: '0x...' })
```

### Webhook payload format

```json
{
  "event": "payment.completed",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "data": { "contentId": "post-1", "amount": "0.01" }
}
```

The `x-nibgate-webhook-signature` header contains an HMAC-SHA256 signature of the body using your webhook secret. Verify it on the receiving end to confirm the webhook is authentic.

Events emitted automatically by `createNibgateServer`: `payment_completed`, `unlock_completed`.

---

## 15. Never Do These

- Do not hide paid HTML with CSS or client state after rendering it publicly
- Do not fake payment IDs, receipts, unlocks, or successful access
- Do not replace Gateway/x402 payment signatures with ordinary wallet message signatures
- Do not store backend secrets in browser env vars
- Do not let mutable titles or slugs be the only resource identity
- Do not expose private content in `nibgate.json`, meta tags, JSON-LD, page source, or static builds

---

## 16. Framework Notes

- **Next.js**: Use route handlers for `/nibgate.json` and `/api/nibgate/access`. Protect content before rendering paid payloads. Use `server-only` for private modules.
- **Express/NestJS**: Use middleware, controllers, or guards around protected routes. Mount the admin router at `/admin/nibgate`.

  For a one-line payment verification middleware:

  ```ts
  import { verifyPayment } from '@nibgate/sdk/server'

  app.get('/api/content/:id', verifyPayment({ resource: { id: 'my-post', price: '0.01' } }), (req, res) => {
    // req.nibgate.verified is true
    res.json({ content: 'Protected content here' })
  })
  ```

  The middleware checks `x-nibgate-payment-proof` (existing unlock) and `payment-signature` (new Gateway payment). Returns 402 with a challenge if neither is present.
- **Astro/SvelteKit/Remix**: Use SSR/server routes or endpoints. Plain static builds need a protected API or signed URL for private payloads.
- **CMS apps**: Save Nibgate resource settings beside each content record. Use `settingsToAccessPolicy()` and `settingsToUnlockPolicy()` to convert stored settings to resource shapes. Mount the admin panel for easy management.
- **Static/vanilla HTML/JS**: Compile the SDK into a bundle with esbuild (see section 8). Use `gate()` and `nibgate` from the global `Nibgate` namespace.
