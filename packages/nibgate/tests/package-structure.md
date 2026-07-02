# Package structure

```text
src/index.js                 public browser SDK entry
src/server.js                public creator-server entry
src/testing.js               dev/test event seeding entry

src/core/resource.js         shared resource, content type, access, and unlock policy normalization
src/core/rating.js           shared rating normalization and legacy message helpers

src/browser/index.js         browser SDK composition and public client helpers
src/browser/env.js           browser environment helper
src/browser/events.js        widget/hub event queue and emitter
src/browser/gateway.js       browser Circle Gateway payment-signature adapter
src/browser/json.js          browser-safe JSON serialization for bigint payment data
src/browser/reputation.js    direct-browser onchain rating transaction helper
src/browser/storage.js       local proof/unlock display-state storage

src/server/index.js          server export barrel and default server instance
src/server/access.js         access enforcement, protected handlers, proof-backed unlock responses
src/server/actor.js          human/agent actor detection and access-mode selection
src/server/challenge.js      x402 payment challenge payloads
src/server/gateway.js        Circle Gateway buyer/server helpers and real payment verification bridge
src/server/hub.js            hub event streaming to the Nibgate backend
src/server/manifest.js       nibgate.json manifest generation
src/server/proof.js          signed unlock-proof creation and verification
src/server/presets.js        creator-safe server presets such as Circle Gateway mode
src/server/response.js       JSON response helper
src/server/runtime.js        runtime package resolution for creator app installs and monorepo demos
```

Public imports:

```ts
import { createEvmGatewayUnlock, trackResourcePage } from 'nibgate';
import { createCircleGatewayServer, createNibgateServer } from 'nibgate/server';
import { emitTestEvents } from 'nibgate/testing';
```

Rules:

- `nibgate` is browser-safe and creator-facing.
- `nibgate/server` is server-only and enforces paid access.
- `nibgate/testing` is dev/test-only and must not power production unlock UX.
- Runtime code must not invent fake payment ids for successful access.
- Browser access should use `x-nibgate-payment-proof`, not cookies.
- Gateway browser checkout must come from a connected wallet/provider, not a bundled buyer key.
- Production reputation uses indexed onchain ratings matched to unlock proof.
