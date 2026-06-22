# Nibgate Hub Architecture

Nibgate has a split architecture on purpose.

## Source of Truth

### Creator site

The creator site remains the source of truth for:

- content
- routes
- pricing
- payout wallet
- unlock logic
- origin responses

### Nibgate hub

The hub remains the source of truth for:

- connected sites
- verification state
- indexed resource metadata
- aggregated views
- unlock counts
- revenue metrics
- public discovery pages

That means the hub does not need to store full article bodies or duplicate entire creator sites. It only needs enough metadata and event history to make discovery and analytics work.

## Package contract

Every site that installs `nibgate` should be able to provide:

1. `/.well-known/nibgate.json`
2. `/.well-known/nibgate-verify.txt`
3. signed event delivery to the hub
4. local route protection and x402 payment handling

## Manifest

The manifest should answer:

- what site is this
- what domain owns it
- what resources are published
- what do those resources cost
- what license applies
- what verification token should the hub expect

## Verification

The hub connects to a site first, then returns:

- `siteId`
- `siteToken`
- `verifyToken`

The package stores those values in `nibgate.config.json`. The hub later verifies ownership by fetching:

- `/.well-known/nibgate.json`
- `/.well-known/nibgate-verify.txt`

If both contain the expected token, the site can be marked verified.

## Events

The package or runtime can emit signed events such as:

- `resource_view`
- `resource_unlock`
- `payment_completed`

These are intentionally small and metadata-oriented. They should describe what happened without sending the creator's full private content to the hub.

## Current repo state

This repo now includes:

- shared manifest and signing helpers in `packages/cli/src/core/hub.js`
- local creator-site manifest and verification endpoints in the app runtime
- hub API endpoints for connect, sync, verify, and event ingestion
- **Prisma ORM** for persistent, strongly-typed storage of users, sessions, and indexed content.
- **SIWE Authentication** (Sign-In with Ethereum) for Creators to manage their sites.

## Production note

We currently use a `sqlite` file-backed database (`dev.db`) for rapid local iteration. When launching `nibgate.xyz` to production (e.g. Vercel), the Prisma provider in `schema.prisma` will be swapped to `postgresql` connecting to a scalable, persistent Edge Postgres instance.
