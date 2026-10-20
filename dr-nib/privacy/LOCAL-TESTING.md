# Local verification


Latest checkpoint, 19 October 2026: the core real Phala browser run passed:
encrypted research recovery, actual JEV/terminal, report sampling, automatic
settlement/refund, sponsored follow-up and PDF download. Current release and
financial evidence are in [STATUS.md](STATUS.md); other dated entries below are
historical. Seven export formats pass local integration; only PDF has fresh live
acceptance. The JSON test was interrupted. The guest is stopped, actions paused.

421 backend tests / 53 files, 397 contracts, 36 PostgreSQL workflow tests,
frontend TypeScript and exact 362-file source/runtime checks pass (overlapping
coverage). The local compute guard failed during a host/network gap; its
conservative infrastructure bound crossed $1.40, though combined planning total
$2.002169 is below the approved $2.05 maximum. Published billing is delayed.
Verify a provider-side deadline before more paid tests. No Git push or public
frontend deployment occurred.

Latest verifier-repair candidate, 19 October: **420 backend tests / 53 files**,
**389 privacy/client/release contracts** and frontend TypeScript pass. Counts
overlap. The candidate passes exact 360-file source/runtime verification but
has not yet passed fresh hardware review or the corrected live report flow.

The preceding reviewed worker recovered job 48, committed its queued pause,
resumed a real NumPy/Pandas terminal (2.72s, exit 0), retained two public sources
and wrote a draft. Strict quote verification failed; that older release settled
$0.009726 usage and refunded $0.240274. New local tests prove bounded judgment
correction, no retries on uncertain inference, retained checkpoints after
exhausted verification and blocked automatic settlement. Phala is stopped.
See MIGRATION-ACCEPTANCE.md for exact pins, receipts and launch gates.

Use Node 22 and the existing installed workspace dependencies. No command below deploys, pushes, calls paid inference, changes Phala state, or connects to a configured remote database.

1. `pnpm test:drnib-privacy` runs crypto, policy, session, broker and vault contracts with synthetic fixtures.
2. `NIBGATE_POSTGRES_HARNESS=/tmp/nibgate-pg-harness pnpm test:drnib-postgres` uses the existing embedded-postgres harness on a random loopback port. It creates a disposable database and explicit `drnib_test` schema, generates Prisma locally, and removes the cluster afterward. The harness must already contain the `embedded-postgres` and `prisma` packages; the command does not install anything. Set the harness path appropriately on another device.
3. `pnpm --filter @nibgate/frontend exec tsc --noEmit` checks browser/client integration types.
4. `node scripts/drnib-private-browser-fixture.mjs` prints a random loopback URL. Open it in a browser, click **Enroll synthetic vault**, reload, click **Verify after reload**, then **Verify recovery context**. Stop with Ctrl-C. Its recovery material is synthetic test data; the fixture's sessionStorage convenience is deliberately absent from production enrollment.

The new `test/private-vault-workflow.test.js` traverses real broker/guest HTTP and JWT scopes with real PostgreSQL, HPKE/AES envelopes, production parsing and seven export renderers. It explicitly injects a synthetic quote and deterministic model responses. A memory adapter stands in for private R2; no real provider is contacted. The suite executes the checked-in additive SQL migrations in the disposable schema, including SQL-only integrity constraints and inference billing classification. Funding tests use the actual restricted database role with simulated chain responses; they check denied document/vault reads, deposit validation, customer/platform separation, unknown-outcome holds, settlement freeze, and retry/refund deduplication.

The 19 October funded candidate passed 306 contract tests, 395 backend tests in
53 files on disposable PostgreSQL, and frontend TypeScript. These counts do not
establish live wallet deposit or on-chain settlement. The local funding service
read-only preflight passed against the existing testnet contracts and funded
keeper. User wallet signing and a new measured guest release remain separate
acceptance steps; never sign transactions for the user.

## Unverified boundaries

The browser fixture checks real WebCrypto/IndexedDB storage, reload and fresh key-context recovery. It is not the full signed-in Next.js product journey, actual device pairing, physical second-device testing or a model-quality evaluation. The Postgres flow proves software integration with explicit model/evidence fixtures, not live hardware attestation.

Real ACI current session protocol compatibility, measured release identity, approved independent client delivery, production egress, model quality, R2 policy, settlement parity, stage-level crash recovery and a full authenticated browser journey remain separate release gates. Never use a fake attestation acceptance policy or a simulator flag to make a production build appear ready.

## Separate real acceptance, 19 October 2026

The actual signed-in localhost Chrome flow on a freshly hardware-verified guest
completed encrypted upload, native hosted JEV judgments, public retrieval, report
with 8/8 sampled claims supported, a persisted follow-up, and Markdown/PDF
downloads. The report and discussion reloaded with the guest stopped. This is
separate evidence from the deterministic fixtures above; full functional, device,
quality, billing and production acceptance remain open. STATUS.md records the
exact release, provider disclosure, spend, test counts and local-only fixes that
are absent from that release. No Git push or public frontend deploy occurred.

### Batched external payment finality (19 October candidate)

An x402 success header and settlement UUID are not a finalized charge. The
separate money service journals the public authorization nonce/payer/payee/amount
before dispatch, encrypts the returned result, and reconciles directly against
Circle's testnet transfer API. Every attribution field must match. Only a
confirmed/completed transfer with its batch transaction hash finalizes the
expense. Received/batched transfers retain their hold; retrying checks the
existing transfer without another purchase. Failed transfers release the hold.
Cancelled/frozen runs cannot receive late charges. Real payment acceptance is
still required; synthetic fixtures alone do not demonstrate seller settlement.


### Full terminal and search companion acceptance

Build the terminal from `dr-nib/private-terminal/Dockerfile` with the pinned base
and runtime archive. Use the exact resource/capability/security limits generated
by `privateGuestCompose`, the pinned syscall profile, no network, read-only root,
and only owned temporary/socket storage. The local acceptance container is named
`drnib-terminal-local`; after it starts, run
`node scripts/drnib-private-terminal-acceptance.mjs`. This runs real commands with
synthetic data and makes no model or payment calls. It checks Python/NumPy/Pandas,
Bash/Node/jq, carried text artifacts, host/env/network isolation, curl/Python TLS
through an approved response cache and rejected symlink artifacts. A cache test
fixture is not a live upstream HTTP acceptance result.

For the actual Phala release, prepare with `DRNIB_RELEASE_TERMINAL_IMAGE` set to
the reviewed terminal image digest and `DRNIB_RELEASE_BASE_COMPOSE_JSON` pointing
to the independently reviewed previous compose JSON. Preparation verifies the
known base pre-launch hash and writes `pre-launch.sh`; deploy must pass that file
with `--pre-launch-script`. The expected attested compose must independently
include this new script as well as all companion images/settings/security
controls. Never deploy terminal compose with an operator-supplied unmeasured
host profile. Public discovery instead reuses the existing normal retrieval/SearXNG path.
There is no search/detector companion in Phala.


The normal public-tools process reuses `retrieval/index.js`, existing SearXNG and
extension page detection; it does not add a Phala search/detector service. The
local funding launcher accepts only `DRNIB_LOCAL_SEARCH_URL=http://127.0.0.1:3110`
as its optional local override. The default uses the existing service's
`SEARXNG_URL`. Public metadata and query terms are intentionally visible there;
private documents/research context never enter that process. Tests ensure that
auto-continuation accepts only the exact setup-approved zero-cost query and
creator preference. Paid/new requests never inherit that approval.

### Explicit full/funded client mode

The real local frontend launcher now requires explicit
`NEXT_PUBLIC_DRNIB_PRIVATE_FULL_ENABLED=true|false` and
`NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED=true|false`. The full escrow E2E uses both
`true` and `DRNIB_PRIVATE_FUNDING_API_URL=http://127.0.0.1:3105`. Missing mode
flags fail startup rather than silently displaying owner-test/unfunded controls.
The guest independently enforces its measured funding policy. Supply the exact
reviewed manifest path and SHA-256 through the existing launcher variables.

### Export receipt role boundary

Apply migration `0015_private_tool_billing_metadata` before the corresponding
funding/guest grant file. The worker reads the narrow billing view, never
`PrivateToolCall.paymentEvidence` or public request/result payloads. The view
contains only sponsored billing kind, provider-cost amount and matching gross
amount. Verify exports with the actual restricted guest role as well as local
renderer tests; an admin-only test does not establish permission parity.

## Durable lifecycle and conversational activity candidate (20 October)

Run isolated SQL load/crash tests with the existing disposable harness:

```sh
DRNIB_LIFECYCLE_SOAK_MS=60000 NIBGATE_POSTGRES_HARNESS=/tmp/nibgate-pg-harness node scripts/test-drnib-postgres.mjs test/private-lifecycle.test.js test/private-broker-wake.test.js test/private-vault-workflow.test.js
node --test dr-nib/backend/src/privacy/phala-durable-wake.test.mjs dr-nib/backend/src/privacy/phala-lifecycle-api.test.mjs dr-nib/backend/src/privacy/private-narration.test.mjs scripts/drnib-private-session-retry.test.mjs
```

The fixture provider has no cloud/model/payment port; its dispatch rate is not
real inference capacity. Migration `0016_private_worker_lifecycle` is exercised
in the disposable schema. Deployed broker/watchdog must receive the same scoped
lifecycle grants and policy. Run the independent watchdog separately with
`node dr-nib/backend/src/privacy/phala-wake-watchdog.js` under process
supervision. Configure
`DRNIB_PRIVATE_WAKE_IDLE_MS=300000`, an explicit admitted runtime window, and
`DRNIB_PRIVATE_WAKE_MAX_ACTIVE` / `DRNIB_PRIVATE_WAKE_MAX_PENDING` (defaults 4/64).
Bootstrapping checks the table and policy without starting compute. Never
reset the row to evade a runtime allowance; renewal is a reviewed budget step.

See [lifecycle acceptance](LIFECYCLE-ACCEPTANCE-2026-10-20.md) for measured real
Phala wake/idle times and remaining release/client-verifier prerequisites. No
local test or documentation command starts a real worker by default.
