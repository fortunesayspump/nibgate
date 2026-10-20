# Nibgate Docs

Dedicated documentation app for `docs.nibgate.xyz`.

## Local development

```bash
pnpm --filter @nibgate/docs dev
```

The docs app runs on port `3002` by default.

## Deploying to docs.nibgate.xyz

Create a separate Vercel project from the same GitHub repo with:

```txt
Root Directory: docs
Build Command: pnpm --filter @nibgate/docs build
Output Directory: .next
Install Command: cd .. && npx pnpm@10.28.0 install --frozen-lockfile
Node.js Version: 22.x
Include files outside the root directory: enabled
```

Then add the custom domain:

```txt
docs.nibgate.xyz
```

## Current sections

Overview
- What is Nibgate?
- Architecture
- End-to-end lifecycle
- Agent discovery
- Reputation

Creator Platform
- Create a Subblog
- Content types
- Image optimization
- Content encryption
- Discovery & SEO
- Nibshare (quick-share)

Setup
- Quick start
- Install package
- Content structures
- Hub widget
- Verify a site

Data bridge
- Content events
- Analytics events
- Payments and receipts
- Revenue & leaderboards

Reference
- API reference
- Examples
- Roadmap

## Keeping documentation aligned with code

The public site explains implemented behavior. Keep migration acceptance records, test run logs, deployment blockers and historical evidence in the owning engineering directories, not product pages. Label proposed adapters separately from implemented runtime behavior.

| Topic | Implementation to inspect |
| --- | --- |
| SDK checkout, tokens and route protection | `packages/nibgate/src/server/{access,proof,fee-wallet}.js`, `src/browser/{access,transfer}.js` |
| Hosted policies and persistence | `packages/nibgate/src/server/access-policy.js`, Nibshare controller/service, Subblogs access service/routes |
| Public APIs, events and ratings | `backend/src/server/routes/hub-routes.js`, `backend/src/server/hub/helpers.js` |
| Fee wallets and held-tip authority | `contracts/{GatewayFeeWallet,TipHoldingFactory,TipHoldingWallet}.sol` |
| Networks | `packages/internal/src/networks.js` and `scripts/check-network-sync.mjs` |
| Private research | `dr-nib/privacy/README.md` and the runtime paths it maps |
| Public machine contracts | Root `AGENTS.md` surface registry |

A generic SDK capability does not imply hosted storage, persistent entitlements or a CMS plugin. Distinguish public metadata from private bodies, a submitted proof from verified settlement, operator-paid compute from customer debits, and hardware-confidential inference from hosted ZDR processing.

Validate a documentation change with the docs build and local route/link checks. When endpoint descriptions change, synchronize OpenAPI, MCP, registry versions and affected agent guides. Publication and live verification are separate release actions; a local edit does not establish deployed parity.
