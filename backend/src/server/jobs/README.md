# Scheduled API monitors — review-only rollout

This phase adds opt-in `manifest`, `reputation`, `gsc-sitemap`, and `gsc-index`
processes. Defaults preserve embedded timers. No HTTP endpoint, payment flow,
fee keeper, verification sweep, receipt-integrity sweep, settlement reconciler,
Phala controller, watchdog, idle shutdown or budget protection is changed.

## Reviewed rollout sequence (not executed)

1. Review this branch based on `f3d98870768875d4cf4c20364e7b85e8122d5888`.
   Build API and job artifacts from the SAME reviewed commit. Record commit and
   immutable image digest. No source-to-image proof was found for the supplied
   private broker digest `sha256:5fd00aeb2443f0b2f06dd1540a7d5a7b0664fccebdf8a0bf6be216ba45a0ea44`.
   Do not replace a private image using this checkout on that assumption.
2. Apply only the additive migration
   `packages/cli/prisma/migrations/20261117000000_add_background_job_state/migration.sql`
   through the normal reviewed migration process for each database. It creates
   one new table; existing tables are unchanged. Generate Prisma during build
   (`pnpm --filter @nibgate/cli exec prisma generate`). The worker does not run
   migrations, generate clients, load local .env files or start the HTTP server.
3. Prepare four separate Railway cron services per intended network, with no
   public domain or HTTP healthcheck, one replica, restart policy NEVER, and
   the same build artifact/dependencies as the API. Override its default HTTP
   start command. Commands below assume repository root as working directory.

   | Job | Start command | UTC schedule |
   | --- | --- | --- |
   | Manifest | `pnpm --filter @nibgate/backend jobs:run manifest` | `*/15 * * * *` |
   | Reputation | `pnpm --filter @nibgate/backend jobs:run reputation` | `*/5 * * * *` |
   | Sitemaps | `pnpm --filter @nibgate/backend jobs:run gsc-sitemap` | `0 2 * * *` |
   | Index inspection | `pnpm --filter @nibgate/backend jobs:run gsc-index` | `30 2 * * *` |

   Configure database/network/RPC and only job-required secrets using Railway
   variable references, never copied into code or commands. No financial signing
   keys are needed. Set `NIBGATE_SCHEDULED_MONITORS` to the selected job(s) on
   both API and workers, e.g. `manifest,reputation,gsc-sitemap,gsc-index`.
   Omit Google jobs if credentials are not configured. Existing individual
   `*_DISABLED=true` switches are respected and fail the selected worker closed.
   Set identical `NIBGATE_JOB_SCOPE` across replicas/services for the same
   network/chain/reputation contract, different scopes for different chains or
   contracts. Do not rename a scope without a checkpoint migration: it creates
   a new independent history/lock. Mainnet and testnet must not share a scope.
   Set explicit `NIBGATE_REPUTATION_START_BLOCK` to a reviewed historical block
   (contract deployment block for complete backfill). It is used only when no
   durable cursor exists. Never select a recent block just to reduce work.
   Existing default RPC selection remains unchanged; verify chain and contract.
4. First redeploy the API with selected loops disabled. Wait for ALL old API
   deployments to stop before starting cron services: old embedded loops do not
   participate in these leases. Then enable the prepared cron services. Observe
   successful jobs and growing reputation cursor before declaring cutover done.
   Keep fee keeper and private safety/funding workers running. Do not set
   `NIBGATE_DISABLE_KEEPER=true` as part of this rollout.
5. Check each network separately: completed runs, duration below 240 seconds,
   skipped lease/slot counts, failed exits, reputation lag, manifest freshness,
   and Google quota/errors. Workers log only job name and skip/success status;
   existing sweep logs provide partial failure details. Failures exit 1; deadline
   exits 124; termination exits 143. Alert on consecutive failures and lag.
6. Rollback: stop cron services and wait for active workers to exit (or their
   deadlines), then remove the relevant names from the API variable and redeploy.
   Keep the additive table and checkpoints. Before returning to cron, reconcile
   the retained reputation cursor with any embedded indexing interval.

Railway documents a minimum five-minute spacing, UTC scheduling, and skipping
runs when a preceding deployment is still active:
https://docs.railway.com/cron-jobs (checked 2026-11-17).
This rules out moving five-second Phala enforcement or 15-second settlement to
these schedules. Reputation freshness intentionally changes from 30 seconds to
approximately five minutes plus scheduling delay and any catch-up backlog.

## Failure and replay semantics

A database-clock lease atomically claims each scoped job. Successful completion
records the claim time; another invocation in the same UTC cadence slot skips.
A failed invocation releases its lease without advancing its cursor. A crash or
forced termination retains the lease for at most `2 * timeout + 60 seconds`
(default nine minutes); the next eligible schedule then resumes. One missed
cron does not erase a reputation range. Each run indexes at most 5000 blocks,
starting after the persisted cursor. If chain growth exceeds processing rate,
lag grows: alert and review chunk/cadence before rollout. No reorg/finality
policy is added; existing chain assumptions still require review.

A separate supervisor kills the child at `NIBGATE_JOB_TIMEOUT_MS` (default and
maximum 240000). This bounds blocked requests and event loops, including DB
cleanup. Normal success/failure awaits Prisma `$disconnect()` and exits. Timeout
can leave partial writes: this is at-least-once execution, not an atomic sweep.
Reputation replays use the existing `(contentId, walletAddress)` upsert; manifest
sync uses existing content upserts and scan timestamps. Failed manifest sites
retain the existing 30-minute retry delay. Invalid/unmatched rating logs retain
existing skip behavior. No financial work is in the job allowlist.

Google sitemap submission skips already submitted sitemaps. Index inspections
and IndexNow submissions can repeat on a crash and consume quota; exactly-once
remote effects are not guaranteed. Existing Google index code persists its hash
before some downstream submissions and swallows sitemap re-submit failures;
those downstream actions are not a durable delivery queue. Do not claim complete
SEO delivery recovery from this scheduler alone. Large sweeps that repeatedly
hit the deadline need pagination/checkpoints before enabling them at that size.

## What still prevents a safe blanket serverless switch

The API retains fee distribution (15 minutes), verification and receipt-integrity
checks (6 hours), optional JEV metadata enrichment, and the hourly metric-dedupe
DB cleanup timer in `hub/helpers.js`. Those perform outbound work. Inspect other
startup hooks, Prisma idle pool behavior, DB keepalives, and private outbound
traffic before declaring any API sleep-compatible. The worker limits its own DB
pool through existing defaults and closes it; it does not change the API pool.
The Google jobs also call `GSC_HUB_BASE` and site sitemaps and therefore wake those
services on their daily schedules. Set the correct network-specific hub URL.

Next exact steps: give verification/integrity/metric cleanup bounded durable
jobs; separate fee keeper into a continuously reliable worker with its own
financial review; audit optional JEV work; observe an idle API's outbound traffic
and connections for more than ten minutes. Then enable serverless on eligible
HTTP services and redeploy. Railway serverless only takes effect for newly
deployed containers and sleeps after 5–10 minutes without outbound traffic,
including private DB traffic: https://docs.railway.com/deployments/serverless.
Measure CPU/RAM/egress and billed usage before/after rollout; flags alone prove
neither sleep nor savings.

Cold start may initially return 502. The existing frontend private-read helper
retries read-only 502/504 responses, but this is not universal API coverage.
Before switching the public API, test idle-to-wake GETs from browser, SDK and
machine clients and add bounded backoff for safe reads as needed. Never blindly
retry payments, settlements or other writes; use their operation status and
idempotency contracts. No live idle/wake or 502 test was performed in this phase.

## Local verification

`node node_modules/vitest/vitest.mjs run backend/src/server/jobs/jobs.test.js`
runs newly added tests without external service calls. The PostgreSQL test is
opt-in via `NIBGATE_JOB_TEST_DATABASE_URL` (only localhost database named
`nibgate_jobs_fixture`) and `NIBGATE_JOB_TEST_PRISMA_CLIENT` (generated client
module path). It applies the migration to an EMPTY disposable database, exercises
two concurrent clients and disconnects both. Never supply a live database.
