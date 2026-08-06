# nibgate

Framework-agnostic browser and server package for creator-owned paid content.

## Install

```bash
npm install @nibgate/sdk
```

Use one package with two entrypoints:

```js
import { createGate } from '@nibgate/sdk'; // browser/client events and UI helpers
import { createCircleGatewayServer, createNibgateServer } from '@nibgate/sdk/server'; // server-side access enforcement
```

This works with Next.js, React apps with an API backend, Express, NestJS, Remix, SvelteKit, Astro SSR, custom servers, and CMS/plugin environments. Plain HTML can use the widget and browser events, but real gating still requires a server, edge function, API route, or signed file endpoint.

Agents integrating Nibgate should read [`SKILL.md`](./SKILL.md) or the public copy at [https://nibgate.xyz/skill.md](https://nibgate.xyz/skill.md) for the compact operating guide. If you are handing a creator site to an AI coding agent, point it at `node_modules/@nibgate/sdk/SKILL.md` or `https://nibgate.xyz/skill.md` before it edits routes, payment code, or widget setup.

## Usage

First paste the widget script from your Nibgate dashboard into your site:

```html
<script async src="https://www.nibgate.xyz/widget.js" data-nibgate-site="SITE_ID" data-nibgate-token="PUBLIC_SITE_TOKEN" data-nibgate-api="https://api.nibgate.xyz"></script>
```

Then define a resource and let the package handle the repeated browser wiring. Nibgate registers the content and reports unlock activity through the widget:

```js
import { checkResourceAccess, trackResourcePage } from '@nibgate/sdk';

const premiumGuide = {
  id: 'premium-guide',
  title: 'Premium Guide',
  type: 'article',
  price: '0.01',
  recipient: '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12',
  path: '/premium-guide',
  access: {
    humans: 'paid',
    agents: 'paid'
  },
  unlock: {
    mode: 'one_time'
  }
};

trackResourcePage(premiumGuide, { source: 'creator-site' });

await checkResourceAccess(premiumGuide, {
  accessPath: '/api/nibgate/access',
  source: 'creator-site',
  async createPaymentSignature({ paymentRequiredHeader, resource }) {
    // Production path:
    // Ask the connected user/agent wallet or Gateway adapter to sign/pay
    // the PAYMENT-REQUIRED challenge returned by the creator server.
    return walletGatewayAdapter.pay({
      paymentRequiredHeader,
      resource
    });
  },
  onStatus(message) {
    console.log(message);
  }
});
```

For plain browser pages, bind a button without writing custom event glue:

```js
import { setupResourcePage } from '@nibgate/sdk';

setupResourcePage(premiumGuide, {
  source: 'creator-site',
  accessPath: '/api/nibgate/access',
  createPaymentSignature: walletGatewayAdapter.pay,
  button: '[data-nibgate-unlock]',
  status: '[data-nibgate-status]'
});
```

For a ready-made unlock button/controller, use `createWalletCheckout`. The package owns the UI state, retries, unlock events, and proof-backed access retry; your wallet/Gateway adapter only has to return the payment signature for the `PAYMENT-REQUIRED` challenge.

```js
import { createWalletClient, custom } from 'viem';
import { createCircleGatewayBrowserAdapter, createWalletCheckout } from '@nibgate/sdk';

const walletClient = createWalletClient({ transport: custom(window.ethereum) });
const [address] = await walletClient.getAddresses();
const circle = await createCircleGatewayBrowserAdapter({
  chainId: 5042002,
  signer: {
    address,
    signTypedData: (params) => walletClient.signTypedData({
      account: address,
      ...params
    })
  }
});

createWalletCheckout(premiumGuide, {
  button: '[data-nibgate-unlock]',
  status: '[data-nibgate-status]',
  accessPath: '/api/nibgate/access',
  pay: circle.pay
}).mount();
```

Do not replace the Gateway payment with a normal wallet message signature. Gateway/x402 payment signatures are payment proofs; wallet message signatures are only used for rating/reputation proof.

The browser Circle Gateway adapter expects the creator server to return Circle's real `PAYMENT-REQUIRED` batching challenge. Use the preset on your server route:

```js
import { createCircleGatewayServer } from '@nibgate/sdk/server';

const nibgateServer = createCircleGatewayServer({
  origin: 'https://creator.example',
  secret: process.env.NIBGATE_SECRET,
  network: 'eip155:5042002'
});

export function GET(request) {
  return nibgateServer.accessResponse(request, premiumGuide);
}
```

Equivalent manual config:

```js
createNibgateServer({
  paymentMode: 'circle-gateway',
  network: 'eip155:5042002'
});
```

If the server is left in fallback challenge mode, browser checkout will fail closed because there is no Circle `GatewayWalletBatched` verifying contract to sign.


Lower-level event helpers are still available when you need them:

```js
import { nibgate } from '@nibgate/sdk';

nibgate.unlockCompleted('premium-guide', {
  revenue: 0.01,
  currency: 'USDC'
});
```

After a verified unlock, a creator UI should submit an onchain rating for the same resource. The hub only counts it into reputation when it can connect the rating wallet to an unlock receipt/proof. Use the built-in controller when you want simple selector-based UI wiring:

```js
import { createEvmGatewayUnlock, createOnchainRating } from '@nibgate/sdk';

const premiumGuide = {
  id: 'premium-guide',
  title: 'Premium Guide',
  type: 'article',
  price: '0.01',
  recipient: post.recipientWallet,
  url: `https://creator.example/blog/${post.slug}`,
  path: `/blog/${post.slug}`
};

let lastPayment = null;

const rating = createOnchainRating(premiumGuide, {
  // Optional on Arc Testnet. The SDK defaults to NIBGATE_REPUTATION_CONTRACT.
  contractAddress: process.env.NEXT_PUBLIC_NIBGATE_REPUTATION_CONTRACT,
  siteId: process.env.NEXT_PUBLIC_NIBGATE_SITE_ID,
  token: process.env.NEXT_PUBLIC_NIBGATE_SITE_TOKEN,
  indexUrl: 'https://api.nibgate.xyz/api/hub/reputation/ratings/index',
  ratingTarget: '[data-nibgate-rating]',
  ratingButtons: '[data-rating]',
  status: '[data-nibgate-status]',
  visible: false,
  getPaymentId: () => lastPayment?.paymentId,
  getUnlockRef: () => lastPayment?.paymentId || lastPayment?.txHash || ''
});

createEvmGatewayUnlock(premiumGuide, {
  accessPath: `/api/content/${post.slug}`,
  connectButton: '[data-nibgate-connect]',
  unlockButton: '[data-nibgate-unlock]',
  walletLabel: '[data-nibgate-wallet]',
  status: '[data-nibgate-status]',
  onUnlock(result) {
    lastPayment = result.payment;
    rating.setPayment(lastPayment);
    rating.setVisible(true);
  }
});
```

The lower-level `rateContentOnchain(resource, options)` function is also exported for custom UIs.

The SDK exports the current Arc Testnet reputation deployment as `NIBGATE_REPUTATION_CONTRACT`, plus `NIBGATE_REPUTATION_CHAIN_ID`, `NIBGATE_REPUTATION_CHAIN_NAME`, and `NIBGATE_REPUTATION_RPC_URL`. Pass `contractAddress` only when overriding the default deployment.

Ratings are proof-gated. Page views, time spent, scroll depth, and referrers are analytics signals; they should not become trust by themselves. Reputation-critical inputs use indexed onchain rating proofs. Signed ratings remain available only for local tests and migration tooling.

Nibgate reputation uses a versioned content identity:

```text
keccak256("nibgate:content:v1|domain|externalId|url")
```

The namespace lets future versions add metadata hashes, content version hashes, IPFS/Arweave pointers, or creator signatures without changing what old ratings mean.

The package talks to the widget through `window.nibgateHub`. If your app runs before the async widget finishes loading, events are queued and flushed once the widget is ready.

Content types are `music`, `video`, `article`, and `image`.

## Discovery metadata quality

Nibgate can only make good Explore cards and agent-readable records from metadata the creator site provides. Pass the same shape whether content comes from MDX frontmatter, a CMS row, a media table, or a custom admin dashboard:

```js
import { trackResourcePage, validateResourceMetadata } from '@nibgate/sdk';

const resource = {
  id: post.id,
  title: post.title,
  description: post.excerpt,
  type: 'article',
  imageUrl: post.coverImageUrl,
  tags: post.tags,
  price: post.price,
  currency: 'USDC',
  recipient: post.recipientWallet,
  path: `/blog/${post.slug}`,
  url: `https://creator.example/blog/${post.slug}`,
  access: { humans: 'paid', agents: 'paid' },
  unlock: { mode: 'one_time' }
};

const quality = validateResourceMetadata(resource);
if (!quality.ok) console.warn(quality.errors);

trackResourcePage(resource);
```

Required for clean discovery: `id`, `type`.

Recommended for rich cards: `title`, `url`, `description`, `imageUrl`, `tags` (title and url are auto-derived when missing).

Required for paid content: `price`.

The package warns in the browser when important metadata is missing and sends a metadata quality summary to the hub with content events. The backend stores that summary so dashboards can surface setup issues instead of silently creating weak content cards.

## UI components

The package includes lightweight controller UIs for common integration patterns:

### Unlock checkout

`createWalletCheckout(resource, options)` mounts a complete unlock button, status controller, and content display. It handles wallet connect, Gateway payment, proof-backed access retry, and delegating the Gateway signature to your wallet adapter.

`createEvmGatewayUnlock(resource, options)` wires connect wallet, disconnect, unlock, wallet label, status text, and unlocked content visibility for EVM-compatible wallets.

`createTransferCheckout(resource, options)` supports direct Arc testnet transfer-style unlocks where Gateway is not used.

```js
import { createWalletCheckout, createCircleGatewayBrowserAdapter } from '@nibgate/sdk';

const circle = await createCircleGatewayBrowserAdapter({
  chainId: 5042002,
  signer: { address, signTypedData }
});

createWalletCheckout(premiumGuide, {
  button: '[data-nibgate-unlock]',
  status: '[data-nibgate-status]',
  accessPath: '/api/nibgate/access',
  pay: circle.pay
}).mount();
```

### Gateway balance display and deposit

The SDK exposes Gateway balance queries and deposit/withdraw triggers for buyer wallet management:

- `getGatewayBalances({ buyerPrivateKey })` — returns available USDC balance on the Gateway for the configured buyer.
- `depositToGateway(amount, { buyerPrivateKey })` — deposits USDC into the Gateway for use in future x402 payments.
- `withdrawFromGateway(amount, { buyerPrivateKey, recipient })` — withdraws USDC from the Gateway back to a wallet.

Via CLI:

```bash
# @nibgate/cli is in-repo only (not published), so run it via the workspace:
pnpm --filter @nibgate/cli exec nibgate balance
pnpm --filter @nibgate/cli exec nibgate deposit 1.0
```

### Onchain rating UI

`createOnchainRating(resource, options)` wires rating buttons, status text, rating panel visibility, payment proof references, onchain rating submission, and hub indexing. Ratings are proof-gated — the wallet must have an unlock or payment proof for the content.

```js
const rating = createOnchainRating(premiumGuide, {
  contractAddress: process.env.NEXT_PUBLIC_NIBGATE_REPUTATION_CONTRACT,
  siteId: process.env.NEXT_PUBLIC_NIBGATE_SITE_ID,
  token: process.env.NEXT_PUBLIC_NIBGATE_SITE_TOKEN,
  indexUrl: 'https://api.nibgate.xyz/api/hub/reputation/ratings/index',
  ratingTarget: '[data-nibgate-rating]',
  ratingButtons: '[data-rating]',
  paymentId: lastPayment?.paymentId || '',
  getUnlockRef: () => lastPayment?.paymentId || ''
});
```

### Content settings UI

`createNibgateContentSettings(options)` gives admin pages stable fields for content type, human/agent access, unlock mode, payment rail, price, recipient wallet, and license.

Creators keep their own UI/theme. Nibgate provides the hard parts: resource normalization, metadata validation, x402/Gateway unlock, transfer fallback, event streaming, proof storage, rating tx submission, and hub sync.

## Security

### Premium content must NEVER be in the HTML

This is the most important rule. Paid content (body, media URLs, download links) **must not exist in the initial page HTML**. Including it with `display: none` or `hidden` is not secure — anyone can view the page source or use DevTools to see it.

**Correct architecture:**

```
[Browser]                  [Your Server]              [Hub]          [Circle]
    │                            │                       │               │
    ├── GET /api/content/:id ────┤                       │               │
    │                            ├── returns teaser ─────┤               │
    │    (NO body in HTML)       │  (no body for paid)   │               │
    │                            │                       │               │
    ├── GET /api/nibgate/access ─┤                       │               │
    │    with stored proof       ├── verifyProof() ──────┤               │
    │◄─── 200 { content } ───────┤                       │               │
    │                            │                       │               │
    │  [Content rendered from    │                       │               │
    │   server response, never   │                       │               │
    │   in page source]          │                       │               │
```

**Implementation pattern (backend):**

```js
// Public endpoint — NEVER returns body for paid posts
router.get('/posts/:slug', async (req, res) => {
  const post = await db.post.findUnique({ where: { slug: req.params.slug } });
  if (post.price) {
    const { body, ...teaser } = post;  // strip body
    return res.json({ post: { ...teaser, isLocked: true } });
  }
  res.json({ post });
});

// Protected endpoint — returns body only after proof verification
// Note: wrap Express's req in a Fetch Request (accessFor reads headers via
// request.headers.get(...)) and pass a defined resource + slug.
router.get('/nibgate/access', async (req, res) => {
  const request = new Request(`http://localhost${req.originalUrl}`, { headers: new Headers(req.headers) });
  const resource = { id: 'guide', title: 'Premium Guide', type: 'article', price: '0.01' };
  const access = nibgateServer.accessFor(request, resource);
  if (access.allowed) {
    const post = await db.post.findUnique({ where: { slug: req.params.slug } });
    return res.json({ ok: true, content: post.body });  // body ONLY here
  }
  // ... 402 challenge or payment processing
});
```

**Implementation pattern (frontend):**

```js
// The NibgateUnlock component handles everything:
// 1. On mount: sends stored proof → gets content immediately if valid
// 2. If 402: shows unlock button → MetaMask signs → sends proof → gets content
// 3. Content is NEVER in the HTML, only from server response

function NibgateUnlock({ resource }) {
  const [content, setContent] = useState('');
  // storedProof: the unlock proof persisted after a prior payment
  // handleUnlock: runs the checkout flow (e.g. createWalletCheckout)

  useEffect(() => {
    fetch('/api/nibgate/access', {
      headers: { 'x-nibgate-payment-proof': storedProof }
    }).then(res => res.json()).then(data => {
      if (data.content) setContent(data.content);
    });
  }, []);

  if (content) return <div>{content}</div>;
  return <button onClick={handleUnlock}>Unlock</button>;
}
```

## FAQ / integration gotchas

- `Does a creator need a server?` Yes for real paid gating. Static-only sites can register discovery events, but protected content needs a server, edge function, CMS webhook, or API route that can return `402` and verify payment proof. The premium body must come from a protected route, not from client-side hiding.
- `Can every post pay a different wallet?` Yes. Set `recipient` or `payTo` per resource. The package does not force one site-wide receiver.
- `Can this work with DB blogs, MDX, CMS, plain HTML, or custom apps?` Yes. Convert each content item into a Nibgate resource with `id`, `title`, `type`, `url`, `path`, `price`, and `recipient`.
- `Why does content not show in Explore?` Usually the widget is missing, the site is not verified, the manifest has not synced yet, `url` is not absolute, or required metadata is missing.
- `Why does reputation not update?` The rating wallet must have an unlock/payment proof for that content, the rating tx must be onchain, and the backend indexer must sync the tx.
- `Are page views reputation?` No. Views, referrers, scroll depth, and time spent are analytics signals. Reputation-critical scores come from indexed onchain ratings tied to unlock proof.
- `Do agents use a different flow?` No. Agents discover the same resource metadata, pay through the same protected route, and can emit/index reputation using the same proof model.
- `Should hidden content live in browser HTML?` **Never.** The browser should only receive teasers before payment. The full body/media URL should come from a protected route after proof verification. See the Security section above.
- `What breaks most often locally?` Missing wallet provider, wrong chain, missing Gateway client module, CORS on the backend, wrong `NIBGATE_API_BASE`, wrong site token, or a demo route using fallback challenge mode instead of real Gateway mode.


## Payment rails

Gateway is the default rail because it fits x402 and agent-paid HTTP best:

```js
const resource = {
  id: post.id,
  title: post.title,
  paymentRail: 'gateway',
  price: '0.005',
  recipient: post.recipientWallet
};
```

Direct wallet transfer is also a first-class rail for creator apps that want a normal token/native transfer flow:

```js
const resource = {
  id: post.id,
  title: post.title,
  paymentRail: 'transfer',
  price: '0.005',
  recipient: post.recipientWallet
};
```

Transfer unlocks are fail-closed. The browser helper can send a tx hash, but the creator server must verify it before issuing an unlock proof:

```js
createNibgateServer({
  paymentRail: 'transfer',
  async verifyTransfer({ resource, txHash, payment }) {
    // Verify onchain with viem/RPC/indexer:
    // recipient matches resource.recipient
    // amount/token/chain match resource price/currency/network
    // tx hash has not already been used
    return verified;
  }
});
```

## Access policies

For CMS/database-driven sites, keep the gating fields in your own content table, then map each record into a Nibgate resource. Nibgate does not replace your CMS or DB.

If the creator has an admin dashboard, put Nibgate settings in that UI and save them beside the post/content record. The package exports canonical field metadata so each framework can render the same settings natively:

```js
import { NIBGATE_CONTENT_SETTING_FIELDS, createNibgateContentSettings } from '@nibgate/sdk';

const defaults = createNibgateContentSettings({
  recipient: creatorDefaultWallet // the logged-in creator's wallet address
});
```

Then save those values beside the content row:


```txt
Nibgate settings
- Publish to Nibgate discovery
- Content type: article / music / image / video / document
- Human access: free / paid / blocked
- Agent access: free / paid / blocked
- Unlock mode: one_time for the MVP
- Price
- Currency
- Payment receiver for this exact content
- Ratings enabled: on / off
- License or citation terms
```

Example creator DB row:

```js
const post = {
  id: 'post_123',
  slug: 'agent-economy',
  title: 'The agent economy needs native payments',
  price: '0.005',
  recipientWallet: '0xPostSpecificReceiver',
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
    recipient: post.recipientWallet,
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

`recipient` is resource-level on purpose. A creator can run a blog, marketplace, media library, or API product where each post, video, image pack, or API route pays a different wallet from the database. `recipient`, `payTo`, `receiver`, `receiverAddress`, and `creatorWallet` are accepted aliases. The server-level `recipient` or `NIBGATE_SELLER_ADDRESS` should be treated as a fallback, not the only way to route money.

This means Nibgate can fit different creator architectures:

- hardcoded MDX posts with frontmatter
- CMS posts from Sanity, WordPress, or a custom admin
- DB-backed blogs with per-resource payout wallets
- paid media/download routes
- agent-readable API routes

The creator app maps its own record into a Nibgate resource; Nibgate does not force a hosted marketplace schema.

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

Real locking must happen on the server. If you render the full protected payload into HTML and hide it with CSS, crawlers can still scrape it. `@nibgate/sdk/server` is what prevents the protected response from being returned until the request is free, paid with proof, or explicitly allowed by policy.

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

Use `@nibgate/sdk/server` for real route protection. The server layer creates x402-style payment challenges, verifies your payment receipt, and issues a short-lived Nibgate unlock token for the route.

```js
import { createNibgateServer } from '@nibgate/sdk/server';

const nibgateServer = createNibgateServer({
  secret: process.env.NIBGATE_SECRET,
  origin: 'https://creator.example',
  recipient: process.env.NIBGATE_SELLER_ADDRESS, // fallback only
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
  recipient: '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12',
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

For JSON API routes, use the smaller helpers:

```js
import { createNibgateServer, manifestResponse } from '@nibgate/sdk/server';

const nibgateServer = createNibgateServer({
  secret: process.env.NIBGATE_SECRET,
  origin: 'https://creator.example',
  recipient: process.env.NIBGATE_SELLER_ADDRESS // fallback only
});

export function GET() {
  return manifestResponse({
    name: 'Creator site',
    origin: 'https://creator.example',
    content: [premiumGuide]
  });
}

export function access(request) {
  return nibgateServer.accessResponse(request, premiumGuide);
}

export function pay(request) {
  return nibgateServer.payAndUnlockResponse(request, premiumGuide, {
    accessPath: '/api/nibgate/access'
  });
}
```

`accessResponse` is the production route. It returns a real `PAYMENT-REQUIRED` header, verifies the returned `Payment-Signature`, issues a signed `unlockProof`, and accepts future access through the `x-nibgate-payment-proof` header.

`payAndUnlockResponse` is only for local test harnesses and server-side agent tests where you intentionally configure a funded tester key. In `circle-gateway` mode it requires:

```bash
NIBGATE_PAYMENT_MODE=circle-gateway
NIBGATE_SELLER_ADDRESS=0xCreatorReceiver
NIBGATE_BUYER_PRIVATE_KEY=0xFundedTesterPrivateKey
NIBGATE_BUYER_CHAIN=arcTestnet
```

The handler calls Gateway, verifies the returned payment, and returns a signed `unlockProof`. It is for controlled server/agent harnesses, not human browser UX.

Do not ship `NIBGATE_BUYER_PRIVATE_KEY` in a public creator website. In production, the buyer is the visitor or agent. They connect their own wallet/Gateway, sign/pay the `PAYMENT-REQUIRED` challenge, and send the resulting payment signature back to the creator route.

Gateway balance, deposit, and withdraw helpers are also available from the same package:

```js
import { depositToGateway, getGatewayBalances, withdrawFromGateway } from '@nibgate/sdk/server';

const balances = await getGatewayBalances({
  buyerPrivateKey: process.env.NIBGATE_BUYER_PRIVATE_KEY
});

await depositToGateway('1', {
  buyerPrivateKey: process.env.NIBGATE_BUYER_PRIVATE_KEY
});

await withdrawFromGateway('0.5', {
  buyerPrivateKey: process.env.NIBGATE_BUYER_PRIVATE_KEY,
  recipient: '0xCreatorOrBuyer'
});
```

For the MVP, browser demos should use the package wallet checkout helper. Server-side funded tester keys are only for command/API harnesses and agent/server tests.

For command/API-only demos, package helpers can emit the same standard event sequence to the hub:

```js
import { emitTestEvents } from '@nibgate/sdk/testing';

await emitTestEvents(premiumGuide, {
  origin: 'https://creator.example',
  source: 'creator-site'
});
```

The browser `createGate(...)` API gives creators the simple unlock UX. The server API is what should enforce real paid access.

Payments are non-custodial in the Nibgate model. The receiving address belongs to the creator site/package config, and different sites can use different receiving addresses. Nibgate Hub records paid unlock events and payment metadata; it does not hold funds or provide withdrawals.

## Payment receipts

Nibgate supports two receipt paths today:

- `circle-gateway`: store the Circle payment id and a `receiptUrl` only when Circle or your gateway layer returns a real public/internal receipt URL.
- `arc-testnet`: store the Arc transaction hash and optional `chainExplorerUrl`, usually an Arcscan transaction URL.

Do not fabricate gateway receipt URLs. If no provider receipt URL exists, send the payment id/hash and Nibgate will show the recorded payment with the best available explorer link.

On Arc testnet, Gateway payments carry a signed authorization payload rather than a simple transfer hash for every unlock. Nibgate stores that signed payment payload as the payment id/receipt metadata. If your provider exposes a memo, transaction hash, or explorer URL, pass it as `memo`, `txHash`, or `chainExplorerUrl`; the hub will keep it with the payment event.

## End-to-end product flow

1. Creator installs `@nibgate/sdk`.
2. Creator maps posts, media, downloads, API routes, or CMS records into Nibgate resources.
3. Creator adds the widget snippet from the Nibgate hub.
4. Creator exposes `nibgate.json` with package helpers.
5. Nibgate backend verifies the widget and discovers resources.
6. Human visitors or AI agents hit a protected route.
7. Creator server returns `402 PAYMENT-REQUIRED`.
8. Human wallet or agent wallet/Gateway pays and returns `Payment-Signature`.
9. Creator server verifies the payment, issues a signed unlock proof, and serves content.
10. Browser requests include that proof through `x-nibgate-payment-proof` for future access checks.
11. Package/widget emits view, content, unlock, payment, and engagement events to the hub.
12. After unlock, the visitor or agent can submit an onchain content rating tied to the same proof.
13. Hub stores metrics for content, site, and creator analytics, then indexes onchain ratings into content, site, and creator reputation.

## Local demo

The repo includes a plain Express creator site that uses the package without any framework adapter:

```bash
npm run dev:demo
```

The demo imports `@nibgate/sdk/server`, serves the browser client locally, registers article/music/image/video/document content, and protects `/articles/premium-agent-economy`.

It also includes local routes for database/custom CMS, MDX/frontmatter, headless CMS, static teaser/protected API, media/file, and agent/API publishing styles under `/examples`.

Real unlocks are fail-closed. Set these env vars before using the local Gateway payment button:

```bash
NIBGATE_PAYMENT_MODE=circle-gateway
NIBGATE_SELLER_ADDRESS=0xYourSellerAddress
NIBGATE_BUYER_PRIVATE_KEY=0xYourFundedBuyerPrivateKey
```

Without a real Gateway payment, the server will not issue a Nibgate unlock token.
