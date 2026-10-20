# Historical snapshot — 20 October 2026

Superseded by [current privacy documentation](../../privacy/README.md). Preserve as evidence; do not use historical budgets, release pins or pending tasks as current instructions.

## Approved continuation — 20 October 2026

The owner approved cumulative **$0.77 AI + $1.54 infrastructure = $2.31 combined** for one guarded 35-minute real test of the quality/control candidate. This replaces the previous $2.25 ceiling; it is an allowance, not a charged invoice. Historical usage holds remain unchanged. The local guard is best effort and provider billing may be delayed.

# Private AI budget controls

## Current scope (20 October 2026)

The owner approved cumulative development ceilings of **$0.77 AI + $1.48
infrastructure = $2.25** for the guarded gateway/narration test. These are spending allowances, not actual invoices or
customer run prices. The real owner-scoped E2Es passed paid creator access,
positive held tipping, settlement/refund and receipt export. Current customer
compute/storage allocation is still operator-funded and not metered per run.
See [STATUS.md](../../privacy/STATUS.md) for exact amounts and [PRODUCTION.md](../../privacy/PRODUCTION.md)
for proposed wake/idle behavior. Older dated checkpoints below are historical.

Run `521c6e5c` / job 53 added $0.014011 of priced model usage including
sponsorship: $0.011718 charged to its $0.25 escrow and $0.238282 refunded.
The global ledger is now $0.194865 priced usage plus $0.485428 preserved
historical holds ($0.680293 used and held, below the $0.77 AI ceiling). All 16
model operations in this run are accounted; four signed gateway refusals
recovered without another reservation. No old hold was called a zero bill.
The 35-minute guard stopped the guest at 13:11:25 UTC, with a $1.475091 planning
bound before later stopped-disk accrual. Stopping compute does not remove the
provider's disk charge. These bounds are distinct from delayed published billing.

## Gateway refusal accounting (local recovery candidate)

A verified, receipt-bound pre-forwarding session refusal is not inference usage.
The worker may refresh the pinned session once without consuming a second
inference reservation. Only the SDK's authenticated refusal proof can release
that reservation; HTTP 412 by itself cannot. Two proven refusals commit zero
as `not-dispatched`, with the signed receipts retained as evidence. An unknown
outcome after a proven refusal still holds the full reservation. Error receipt
IDs/request hashes are now retained for later reconciliation, and successful
usage includes its receipt ID. Error bodies and prompts do not enter this
billing metadata.

Historical reservations without request/receipt identifiers cannot be marked
zero from a displayed balance or an error label. Provider records and a unique
request match are required; ambiguous matches remain unresolved. The existing
inference credential can read balance, while the CLI key is denied billing
transactions. Signed-in browser inspection on 20 October found 112 spend
records totaling $0.218788 for the displayed 30-day range. The CSV export has
no request IDs. Matching model/timestamps/tokens helps audit existing verified
calls, but cannot authenticate an old missing receipt. No historical hold was
released, and the absence of a recent failed request from that view does not
prove a zero charge. The comparison is saved locally at
`/tmp/drnib-phala-signedin-usage-comparison.json`. This candidate has not yet
passed its real-model test.

## Expense receipts and infrastructure allocation

The owner receipt now itemizes AI/JEV calls, model identity, input/output token
counts and priced usage. Only matching `private-ai:<call-id>` spend ledger rows
are labeled charged. Sponsored calls, pending priced usage, unresolved holds
and waived/platform-covered costs are separate. A later provider receipt cannot
increase a frozen settlement. The receipt reconciles deposit minus charged
expenses minus confirmed refund to the remaining escrow balance. The 1%
platform share is included in charged expenses. No additional fee is subtracted.
The JSON receipt is downloadable from the private run and included in JSON
report exports; it is an expense receipt, not a tax invoice.

Phala CVM compute and disk are currently **operator-funded**, explicitly shown
with a zero customer charge and `allocation: not-metered`. This does not mean
Phala bills nothing. Its [official pricing](https://cloud.phala.com/about/pricing)
charges CPU machines by running minute and storage even while stopped. Private
AI inference is a separate bill. The shared VM bill and test/debugging allowance
must never be attributed wholesale to a customer run.

Before charging compute, implement a versioned, disclosed rate/allocation
policy, trusted active-run metering, concurrency allocation that cannot allocate
the same machine capacity twice, and atomic budget reservations alongside AI
and paid tools. Include the compute maximum in the pre-funding estimate and
existing escrow cap; stop/pause before exceeding it. Operator idle time, failed
deployments, development/debugging and unallocated disk remain operator costs.
Do not retroactively charge old runs. Exact provider costs, conservative
reservations and estimated allocations must remain distinguishable. Actual authorized creator purchases and held tips now have durable expense
records; unimplemented tools must not be represented as measured zero-cost
executions.

Recommended allocation: one machine-wide meter divides each eligible running
interval across its active research runs, using a published versioned rule.
The sum allocated to customers must never exceed that interval's machine cost;
idle time, user-paused time and development work go to the operator. Reserve
the next interval's worst-case share within the same approved run cap before
admitting it, then reconcile the allocation and release unused headroom. Use
integer units and one rounding reconciliation so per-run rounding cannot
overallocate the shared bill. Provider billing delays remain operator risk.
Storage needs a separately disclosed retention period and actual byte/time
allocation before charging it; a settled run cannot silently accrue new fees.
This is the implementation policy for a future compute meter, not a claim that
the current VM bill has already been measured per run.

The tested release includes restricted financial-role grants and the narrow
`PrivateToolBillingMetadata` view. The guest reads billing metadata for exports
without raw payer proofs. The corrected PDF passed on real Phala, with no new
model usage or charge. Production compute metering is still proposed, not enabled.

Current code reference, 19 October 2026. See [status](../../privacy/STATUS.md) for evidence and [plan](../../privacy/PLAN.md) for migration gates. This is a bounded owner-test policy, not full ordinary-product budget/escrow parity or a provider spending guarantee.

The 19 October funded source-only acceptance recorded **0.007348 USD** in
finalized customer calls from a **0.25 test-USDC** deposit and confirmed a
**0.242652 test-USDC** refund on Arc. Sponsored intake/planning was excluded.
This does not replace unresolved historical provider holds or increase the
approved cumulative **0.65 AI + 1.10 infrastructure = 1.75 USD** ceilings.
Settlement now retries in the separate money process independently of the
browser reply and guest uptime; ledger refunds await confirmed split execution.

## Legacy bounded gate

`dr-nib/backend/src/privacy/private-ai-budget.js` reserves a conservative upper amount in `PrivateAiBudgetReservation` before dispatch. It uses integer micro-USD arithmetic and a PostgreSQL advisory lock to serialize monthly admissions. The transaction rechecks run ownership, confidential classification, deletion and duplicate reservation.

The current prototype enforces a combined AI allocation plus planned infrastructure ceiling of at most 5,000,000 micro-USD ($5). Both allocations and exact model price ceilings must be explicitly configured. This is a code constraint, not a product price. Infrastructure allocation is a planning estimate; this module does not stop infrastructure billing.

The reusable gate accepts at most three calls, 150,000 prompt bytes and 1,200 output tokens per call. The legacy demo/source-only entrypoint applies tighter 8,192 prompt-byte and 512 output-token limits, with one call for the demo or up to three for source-only composition. These limits do not establish complete report-length/quality parity. Prompt-token overhead is conservatively estimated, not independently guaranteed against every provider tokenizer.

## Verified usage and uncertainty

The guest wires `createPhalaAiPort` through the budget gate. The ACI adapter verifies the channel and signed receipt, matching the request, model, serving session and committed response bytes. Usage/cost appears in the completion body; receipt binding authenticates those bytes rather than proving the provider's price is correct. The guest validates usage shape and bounds before reconciling the reservation.

Missing/malformed usage, receipt failure, timeout, crash or uncertain dispatch must not free the reserved allowance or automatically replay paid work. Price ceilings and provider/route surcharges require current review before any live test. Synthetic verifier callbacks do not authenticate real provider usage.

## Customer accounting and refunds (dedicated owner-test release)

The active encrypted workflow uses `PrivateInferenceCall` per model call, with
run/action/model identity, billing kind, reserved maximum, input/output tokens,
reported cost and bounded evidence. New finalized costs use the provider's
reported amount rounded up to six decimal USD places per call. Configured token
prices remain admission/validation ceilings; they are not a minimum charge.
Receipt binding authenticates the Qwen response bytes, not the provider's tariff.
JEV's `accounted` status means provider-reported cost, not attested billing.

Migration 0011 preserves older completed amounts as `legacy-ceiling` estimates.
They cannot become customer debits without priced evidence. Missing price or
uncertain response remains a reservation; it is not an invoice. Locally proven
pre-dispatch failure commits zero. The receipt UI separates priced usage,
historical estimates and unresolved reservations.

The restricted funding service freezes finalized customer-only costs, writes one
spend per inference ID, and retries chain settlement without double debits.
Refund equals confirmed deposit minus finalized customer spend. The existing 1%
platform share is included within that spend, not added again to the refund
calculation. Sponsored intake/planning/discussion and owner testing are excluded
from customer spend. Refund is recorded only after confirmed chain split.
Normal completion waits for unresolved work. The new explicit owner cancellation
path fences further inference and late action commits even while the worker is
offline. In the same transaction it freezes only finalized customer costs;
unconfirmed costs become platform liability. Their global provider reservations
remain intact, never silently erased. Late receipts can reconcile that admission
ledger but cannot increase a frozen customer debit. Chain failure leaves an
idempotent settlement snapshot for retry. A job whose funding transaction is
still unconfirmed remains pending; funding status can later record its confirmed
deposit before settlement is retried. Local database tests
simulate chain results and do not establish a real customer refund.

## Lifecycle and provider controls

`phala-wake-controller.js` manages the configured guest with readiness, attestation and runtime/idle admission deadlines. Local process or network failure can defeat a stop request. A provider-side spending limit or independently operated shutdown control is a separate requirement; neither this ledger nor a local timer establishes a hard infrastructure bill ceiling.

Keep ordinary production budgets/fees unchanged during the local migration. Do not inherit the original owner-test $5 target as a silently changed product budget.

## Verification

Unit contracts are in `private-ai-budget.test.mjs`, the ACI adapter tests, broker money tests and lifecycle suites. Real transaction behavior has separate disposable-Postgres suites in `dr-nib/backend/test/private-ai-budget-postgres.test.js` and related worker/recovery tests. Run them only through the local fixture harness; the isolated test commands do not make live model or cloud calls. Owner-authorized real tests are recorded in STATUS.md.


## Historical encrypted action-workflow checkpoint (19 October)

`private-workflow-ai.js` shares the monthly advisory lock with the legacy gate
and includes both ledgers in admission. It admits at most 48 calls by default
per action, at most 150,000 serialized prompt bytes per call, and closed stage
output limits (intake 4,096, planning/verification 8,192, writing 16,384,
discussion 4,096 and acknowledgment 1,024). Exact total token/cost bounds and
signed response-receipt binding remain mandatory. Research uses the low effort
profile after a high-effort route exceeded the requested output allowance;
unknown or invalid outcomes retain their reservations.

The explicit owner approval is **650,000 micro-USD AI plus 1,100,000 micro-USD
infrastructure ($1.75 combined)**. The reviewed release must bind those separate policy values.
The release helper requires a separately selected infrastructure ceiling when
raising AI above $0.25. A displayed run estimate is conservative; the shared AI
ledger still gates each individual call and can stop a partially completed run.
The local funded candidate checks a chain-confirmed deposit before customer
inference. Sponsored intake/planning/discussion have separate billing tags and
still consume the shared AI allowance. Settlement freezes customer-only usage;
unknown outcomes remain held. The earlier measured source-only release passed
actual wallet-funded browser execution and confirmed settlement. The newer local
checkpoint/receipt candidate still needs measured release and live acceptance.
The local shutdown guard bounds the current test window; provider-side billing
controls are still required for a hard infrastructure spending guarantee.

## Historical owner-test cost checkpoint ($1.75 ceiling)

The latest explicit owner approval raises only infrastructure to **$1.10**,
keeping AI at **$0.65**: **$1.75 combined cumulative maximum**. No customer
deposit is included in this development-cost allowance. The live refund/export
candidate has a 20-minute stop guard; its carried infrastructure planning bound
starts at $1.056, including prior reserved runtime and intervening disk charges.
The last published infrastructure bill is still delayed at $0.821108. A guard
reservation must not be presented as an actual provider charge. See STATUS.md
for the current measured release and wallet handoff; figures below predate this
five-cent allowance increase.

The previous $1.70 approval was a cumulative testing maximum ($0.65 AI + $1.05
infrastructure), not the price of one research run and not an invoice. Historical
read-only AI ledger: $0.109780 historical completed estimates + $0.431846
unresolved reservations = $0.541626 admission commitments. No historical hold
was released or repriced. Last published Phala infrastructure cost: $0.821108;
provider billing is delayed. Runtime guards carry conservative reservations,
which must not be represented as actual infrastructure charges. Reviewed compute
rate was $0.058/hour plus $0.002780/hour disk; disk can continue billing while
compute is stopped. Repeated tests and idle debugging time are owner development
costs, not an automatic customer research surcharge. The guest is stopped, and
no new paid call or ceiling increase is part of this local accounting fix.


## Known research failures (local candidate)

A known execute/resume/revise failure with no reserved inference attempt now
commits encrypted terminal state and retains previous reports/activity. The
money service can settle that failed run using the same finalized customer-only
snapshot and confirmed split/refund rules as a completed run. Repeated failure
or settlement requests do not create duplicate charges or refunds. Unknown
attempts stay reserved and uncertain; no fixed error label converts them into
verified usage or a replay authorization. The final 18-test disposable-Postgres
workflow suite covers these paths; live acceptance on a new measured worker is
still pending. No extra AI/infrastructure allowance was spent testing them.

## Public-tool expenses in the local candidate

An owner-approved external tool reserves `maxMicroUsd` before dispatch under
same-run and global admission locks. AI plus legacy holds plus tool commitments
must fit the funded cap. Exact finalized costs produce one
`private-tool:<call-id>` ledger spend entry and an itemized receipt line. A
trusted proven pre-dispatch failure costs zero; an uncertain dispatch retains
the full hold and never auto-retries. Ending the run waives unconfirmed costs
from the frozen customer settlement; platform liability and the original hold
remain visible. A later result cannot increase an already frozen debit.

The included 1% platform share is now rounded once on aggregate settled spend
using integer floor arithmetic, matching the splitter, rather than rounded
separately on each small model/tool call. It is included in spend, not added
again to the customer's total. Existing confirmed settlements are unchanged.
Gas, Phala time/disk and development remain operator-funded. No compute charge
has been silently added. The $1.75 cumulative owner ceiling is unchanged; this
is separate from a project's customer escrow cap.

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
