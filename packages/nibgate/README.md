# nibgate

Lightweight browser SDK for creator sites using Nibgate.

## Install

```bash
npm install nibgate
```

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
  path: '/premium-guide'
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

## Server protection

Use `nibgate/server` for real route protection. The server layer returns an x402-style `402 Payment Required` challenge until the request has a valid Nibgate unlock token.

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
  path: '/premium-guide'
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
