# API sleep and scheduled maintenance

The rollout branch is based on main `8cd556c31284bb0f07c64ee1f611e6344cdc8362`.

## Runtime roles

- HTTP API: `node backend/src/server/start.js`. Set
  `NIBGATE_SCHEDULED_MONITORS=manifest,reputation,verification,integrity,metadata,metric-cleanup,gsc-sitemap,gsc-index`,
  `NIBGATE_FEE_KEEPER_EXTERNAL=true`, and `NIBGATE_DB_IDLE_DISCONNECT_MS=60000`.
  Embedded maintenance and fee timers stop; the DB pool disconnects only after
  all queries and whole transactions are idle. Prisma reconnects on the next query.
- Maintenance cron: `node backend/src/server/jobs/maintenance.js`, Railway schedule
  `0 */4 * * *` UTC (01:00, 05:00, 09:00, 13:00, 17:00, 21:00 Africa/Lagos).
  Same selected monitors; Google tasks retain daily durable slots. One supervisor
  per job allows four minutes; the dispatcher continues other jobs after failures.
  The maximum full pass is 32 minutes. Restart policy NEVER, no HTTP healthcheck.
- Financial keeper: `node backend/src/server/jobs/fee-worker.js`, continuous worker,
  one replica, zero deployment overlap, 600-second drain, restart ON_FAILURE,
  sleep disabled. It preserves existing fee/holding reconciliation at 15 minutes
  and awaits in-flight work on SIGTERM. It is NOT put behind an expiring cron
  lease or forcibly killed on the nonfinancial four-minute deadline.

Private broker/watchdog/funding services are unchanged: five-second Phala safety
and 15-second settlement reconciliation must remain timely. No private image is
rebuilt from unverified source. Their pinned digest provenance remains outside
this API-only rollout.

## Migration and cutover

Build the reviewed/pushed commit, generate Prisma during build, and apply
`node backend/src/server/jobs/migrate.js` as the API predeploy command. This
applies ONLY the additive BackgroundJobState table, verifies existing columns,
serializes migration runs with a transaction advisory lock, and records its
checksum if an existing Prisma migration ledger is present. It does not run
historical migrations or modify business tables. Reapplication is idempotent.

Use service-scoped Railway variable references for job secrets; never dump/copy
credentials. Maintenance needs DB, network/RPC, Google and optional enrichment
configuration. Keeper needs its existing DB/payment/keeper configuration.
`NIBGATE_JOB_SCOPE` must be stable and unique for database/network/chain/contract.
Changing it creates independent locks and checkpoint history.

Seed `NIBGATE_REPUTATION_START_BLOCK` from a verified block before cutover. An
overlap with the currently operating embedded indexer's 5000-block window retains
its existing coverage; a contract deployment block can instead request complete
historical backfill. Each successful RPC chunk (5000 blocks) is persisted, up to
100 chunks per invocation. Deadline/failure resumes from the last completed
chunk. No success slot is recorded if catch-up exceeds the chunk cap. Monitor
cursor lag; no new reorg/finality policy is introduced.

Deploy/test testnet first. Stop old API deployments before starting the dedicated
keeper (embedded keepers do not use the cron lease). Enable maintenance, verify
migration, completed jobs, cursor growth and API reads, then repeat on mainnet.
Enable Railway serverless on the new API deployment only; it takes effect after
redeployment. Keep rollback deployment IDs and original config in the rollout
record. Prefer immutable commit pins for this rollout to avoid unrelated builds.

Rollback: stop maintenance and dedicated keeper, wait for its in-flight work to
drain, restore API variables/source/sleep setting, redeploy the prior known-good
build. Do not drop the additive table. Reconcile its reputation cursor before
resuming cron. Never run old embedded and new dedicated keepers concurrently.

## Reliability and limits

Atomic DB-clock leases serialize concurrent nonfinancial jobs. Successful jobs
skip duplicate calls in their current UTC cadence slot. Failures release leases;
crashes retain them for at most nine minutes at the default timeout. Replayed
reputation writes use the existing content/wallet upsert. Manifest uses existing
upserts/scan timestamps. At-least-once sweeps can leave partial writes on timeout.
Verification/integrity retain their existing per-record error handling and RPC
uncertainty semantics. Metadata remains bounded by its configured batch size.
Google indexing checkpoints each site and yields pending work after about 150 seconds,
releasing the lease without marking its daily cycle complete. A later four-hour
run resumes; the four-minute supervisor remains a hard fallback deadline.
Sitemap resubmission counts include only successful requests.
Google requests can repeat/consume quota; existing SEO delivery is not an
exactly-once queue. Four-hour scheduling intentionally permits several-hour
reputation/content freshness delays. Large manifest/Google/verification datasets
that continually exceed the deadline need further pagination; alert on failures.

Google's daily requests to the Hub and blog sitemap endpoints may wake those
services. Other user traffic and private traffic can also keep an API awake.
Financial keeper costs remain. Measure billed usage after rollout; flags alone
do not establish savings.

Railway requires at least five minutes between cron runs and skips invocations
while a prior run remains active: https://docs.railway.com/cron-jobs.
Serverless requires a newly deployed container and typically 5–10 idle minutes;
private DB traffic counts, and the first cold request can return 502:
https://docs.railway.com/deployments/serverless (checked 2026-11-17).
Existing private-read clients have bounded 502/504 retries. External clients
must retry safe reads with bounded backoff; never blindly replay payments/writes.
Live rollout checks should include idle-to-wake GETs and record actual outcomes.

## Tests

Use Node 22. `node node_modules/vitest/vitest.mjs run backend/src/server` includes
new scheduling, supervisor, idle-pool and fee-worker drain tests. PostgreSQL
integration is explicitly localhost-only through NIBGATE_JOB_TEST_DATABASE_URL
and NIBGATE_JOB_TEST_PRISMA_CLIENT. See VERIFICATION.md and the rollout record for
commands/results, including skipped financial integration tests.
