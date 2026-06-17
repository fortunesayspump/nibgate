# Nibgate Build Research

Research pack for building Nibgate: a payment app and CLI for tiny pay-per-use access to blogs, articles, music, images, videos, APIs, and agent-readable content.

## Core Payment Protocol

### x402

- Official x402 site: https://www.x402.org/
- x402 docs: https://docs.x402.org/introduction
- Coinbase x402 overview: https://docs.cdp.coinbase.com/x402/welcome
- How x402 works: https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works
- Seller quickstart: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
- Buyer quickstart: https://docs.cdp.coinbase.com/x402/quickstart-for-buyers
- Facilitator concept: https://docs.cdp.coinbase.com/x402/core-concepts/facilitator
- x402 GitHub: https://github.com/x402-foundation/x402

Why it matters:

- Nibgate should use HTTP `402 Payment Required` as the core access handshake.
- The server protects a resource, returns payment requirements, verifies payment, then unlocks the content.
- This works for human users and AI agents because the pricing metadata is machine-readable.

## Arc and Circle

### Arc

- Arc site: https://www.arc.io/
- Arc developer docs: https://docs.arc.io/
- Circle Arc public testnet announcement: https://www.circle.com/pressroom/circle-launches-arc-public-testnet
- Arc contract addresses: https://docs.arc.io/arc/references/contract-addresses
- Arc node docs: https://github.com/circlefin/arc-node/blob/main/docs/running-an-arc-node.md
- Alchemy Arc testnet page: https://www.alchemy.com/rpc/arc-testnet

Why it matters:

- Arc is the stablecoin-native settlement layer for Nibgate.
- Predictable dollar-denominated fees and USDC-native flows fit tiny creator payments better than volatile gas-token UX.

### Circle Gateway

- Circle developer portal: https://www.circle.com/developer
- Circle docs: https://developers.circle.com/
- Circle Gateway product page: https://www.circle.com/gateway
- Dynamic Circle Gateway recipe: https://www.dynamic.xyz/docs/recipes/integrations/swaps/circle-gateway

Why it matters:

- Gateway can make USDC liquidity feel unified across chains.
- For Nibgate, Gateway is relevant for creators withdrawing, routing, or accepting cross-chain USDC without forcing the user to think about chain-specific balances.

## First Platform Integrations

### WordPress

- WordPress Plugin Handbook: https://developer.wordpress.org/plugins/
- WordPress Developer Resources: https://developer.wordpress.org/

Nibgate use cases:

- Pay-per-article.
- Paid tutorials or research notes.
- Paid newsletter archives.
- Agent-paid citations.
- Tiny paid downloads attached to posts.

First integration path:

- A WordPress plugin that adds an admin settings page.
- A post-level metabox for price, currency, access mode, and split metadata.
- Frontend content filter that replaces protected content with an unlock component.
- Backend route that talks to the Nibgate app/gateway.

### Ghost

- Ghost Content API: https://docs.ghost.org/content-api
- Ghost API demos: https://github.com/TryGhost/api-demos

Nibgate use cases:

- Pay-per-post.
- Paid research essays.
- Agent-readable paid citation endpoint.
- Alternative to forcing subscriptions for one article.

First integration path:

- Theme snippet or custom integration.
- Use tags or custom metadata to mark protected posts.
- Nibgate proxy handles protected article access and x402 payment metadata.

## Media Integrations

### Immich

- Immich API docs: https://docs.immich.app/api
- Immich OpenAPI docs: https://api.immich.app/

Nibgate use cases:

- Paid photo albums.
- Paid high-resolution downloads.
- Photographer royalties based on metadata.

### Jellyfin

- Jellyfin docs: https://jellyfin.org/docs/
- Jellyfin plugin docs page: https://jellyfin.org/docs/general/server/plugins/
- Jellyfin plugin template: https://github.com/jellyfin/jellyfin-plugin-template

Nibgate use cases:

- Paid per-view video libraries.
- Per-minute watch payments.
- Community media servers with contributor splits.

### Navidrome

Research still needed:

- Confirm the best integration surface: reverse proxy, Subsonic API behavior, metadata hooks, or external scrobble/listen events.

Nibgate use cases:

- Per-listen music payments.
- Per-minute streaming.
- Track-level splits based on artist/album metadata.

### PeerTube and Owncast

Research still needed:

- Plugin/event hooks for playback start, playback stop, and live stream session metering.

Nibgate use cases:

- Paid video views.
- Per-minute livestream access.
- Agent/video indexing payments.

## Useful Videos

- x402 Explained: https://www.youtube.com/watch?v=Dg5IplJ1mng
- How to Use x402 in your Apps: https://www.youtube.com/watch?v=hDBiXRUme9M
- Get Paid When AI Agents Use Your API using x402: https://www.youtube.com/watch?v=DF2MIaXSgMQ
- Everything You Need to Know to Start Building on Arc: https://www.youtube.com/watch?v=RjWI3MVyWnI
- Developer Overview with Circle's Lead Product Manager Sanket Jain: https://www.youtube.com/watch?v=BG0sHuTqGRc
- How Does Circle Gateway Work?: https://www.youtube.com/watch?v=uQnZUcxR-0M
- Circle developer videos playlist: https://www.youtube.com/playlist?list=PLoJwRn8qrG27RD3qJiLTwLlMEhcnh6fD4
- WordPress Plugin Development playlist: https://www.youtube.com/playlist?list=PLz-tsD7hAvuuvi9K6ukLdaSp9-T2I7xeV

## Useful Tutorials and Articles

- QuickNode x402 paywall guide: https://www.quicknode.com/guides/agentic-payments/how-to-use-x402-payment-required
- QuickNode x402 video paywall sample: https://www.quicknode.com/sample-app-library/coinbase-x402
- Express x402 pay-per-use API tutorial: https://medium.com/@heimlabs/create-a-pay-per-use-api-with-x402-express-js-83390b17985f
- Cloudflare x402 Foundation announcement: https://blog.cloudflare.com/x402/
- Coinbase x402 launch post: https://www.coinbase.com/developer-platform/discover/launches/x402
- Lablab Arc testnet ethers.js tutorial: https://lablab.ai/ai-tutorials/getting-started-with-arc-testnet-send-usdc-with-ethersjs

## Draft Build Plan

### Phase 1: Local Panel and x402 Demo

- Keep `apps/panel` as the local creator control surface.
- Add real x402 middleware for one protected article.
- Add buyer/agent script that discovers price, pays, and fetches content.
- Store payments in SQLite instead of memory.
- Keep route config in `nibgate.config.json`.

### Phase 2: WordPress Adapter

- Build a WordPress plugin that talks to the Nibgate app.
- Plugin features:
  - Admin settings page for Nibgate app URL and creator wallet.
  - Post-level price metadata.
  - Protected content block or shortcode.
  - Unlock button component.
  - Server-side callback to verify access.

### Phase 3: Ghost Adapter

- Build a Ghost theme snippet and custom integration.
- Use Ghost tags or metadata to mark paid articles.
- Proxy protected post routes through Nibgate.
- Add `.well-known/nibgate.json` for agent discovery.

### Phase 4: Media Proof

- Start with a simulated audio route.
- Add listen-session lifecycle:
  - start session
  - approve budget
  - meter seconds
  - stop session
  - finalize payment
- Then test against Navidrome or Jellyfin.

### Phase 5: Agent Mode

- Add a machine-readable manifest:
  - resource id
  - price
  - accepted currency/network
  - license terms
  - max recommended spend
  - citation metadata
- Build a CLI demo:
  - read RSS/article metadata
  - request price
  - pay via x402
  - fetch unlocked content
  - emit citation with payment proof

## Research Questions

- What is the cleanest way to settle x402 payments on Arc testnet today?
- Should Nibgate use an existing facilitator first, then add Arc-specific settlement?
- What exactly should Circle Gateway own in the flow: buyer liquidity, creator withdrawal, or cross-chain treasury?
- Should WordPress be native plugin first, or should the universal reverse proxy remain the first production path?
- What metadata is enough for agents to decide whether paid content is worth buying?
- How should refunds, accidental purchases, and content previews work for tiny payments?
