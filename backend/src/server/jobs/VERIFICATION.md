# Verification — 2026-11-17

Worktree: `/Users/fortune/Documents/Codex/2026-11-17/task/nibgate-scheduled`
Branch: `codex/api-scheduled-monitors`
Base: `f3d98870768875d4cf4c20364e7b85e8122d5888`
Changes are uncommitted for review; nothing pushed or deployed.

- New `jobs.test.js`: **9 passed**, final run after entrypoint/disabled-flag fixes.
  Covers embedded timer suppression/default compatibility, configuration rejection,
  bounded reputation catch-up and RPC failure replay, partial sweep failures,
  checkpoint persistence, disconnect on success/failure, duplicate/lost claims,
  successful/failed subprocess exit and a blocked-event-loop deadline.
- New `postgres.test.js`: **1 passed** separately against disposable localhost
  PostgreSQL (`127.0.0.1:55439/nibgate_jobs_fixture`). Applied the additive SQL,
  used two Prisma clients, verified concurrent exclusion, same-slot deduplication,
  unchanged cursor after failure, expired-lease recovery and continued catch-up.
  Both clients disconnected; local database server stopped after testing.
- Existing backend regression suite plus new unit tests:
  `node node_modules/vitest/vitest.mjs run backend/src/server --maxWorkers=1 --minWorkers=1`
  **113 passed, 21 skipped; 13 files passed, 2 skipped.** This includes 104 existing
  tests and 9 new unit tests. The skipped files are the existing opt-in tip
  PostgreSQL suite and the new opt-in job PostgreSQL suite (run separately above).
- Existing `scripts/drnib-private-read.test.mjs`: **3 passed** using the installed
  TypeScript package through NODE_PATH. Tests read retry after transient response,
  bounded transport retries/abort and no replay of mutation/auth/conflict failures.
- `git diff --check`: passed.
- Prisma 6.19.3 `validate --schema packages/cli/prisma/schema.prisma`: passed (local engine cache access required).

Initial local attempts found broken dependency links, a missing offline package,
missing frontend TypeScript resolution, and a test migration path typo. These
were corrected in the isolated environment. A worker entrypoint guard initially
mistook the Vitest IPC process for its own entrypoint; corrected and rerun cleanly.
Locked dependencies were installed with scripts disabled; lockfile is unchanged.
All test execution used Node **24.22.3**; repository targets Node **22.x**. Repeat
these tests under Node 22 in CI before rollout. No Node 22 binary was installed.
The SQL integration used the checkout's existing generated Prisma client and the
new table through raw parameterized queries, so no live client generation or
migration was needed.

Not run: full monorepo tests, existing financial PostgreSQL integration suite,
real RPC/Google/manifest sweeps, live Railway deployments, sleep/wake/502 probes,
credential-bearing actions, private broker/funding/Phala actions, production
migration or cost measurements. Source parity with the supplied private Docker
image digest remains unverified. Read README.md for precise rollout, rollback,
scheduler limitations, retry semantics and remaining API sleep blockers.

## Authorized rollout follow-up

Reapplied on current main `8cd556c3` in branch `codex/api-scheduled-rollout`.
Node 22.23.5 full backend suite: **118 passed, 21 skipped** (14 files passed,
2 opt-in integration files skipped). Updated one stale IndexNow test fixture to
use an eligible mainnet domain required by the newer production domain guard.
Added four lifecycle tests: no disconnect during queries/whole transactions,
query waits for ongoing disconnect, fee-worker graceful drain, preserved cadence.
Exact migration runner passed first apply and repeated apply on a fresh localhost
fixture. Real Prisma interactive transaction/idle disconnect/reconnect checked
separately. The original phase-one notes above describe the earlier checkpoint,
not final deployed state; consult the rollout record for live outcomes.
