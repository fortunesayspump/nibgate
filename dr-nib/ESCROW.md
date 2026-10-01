# Research escrow on Arc

How a Dr. Nib run holds the user's money and gives it back. Design note, not
flow — the user-facing journey lives in `FLOW.md`.

## Short version

Do not invent an escrow standard. **ERC-8183 (Agentic Commerce)** is a Draft
ERC built for exactly this shape — scoped work, escrowed budget, an evaluator
who alone decides the outcome — with a reference implementation
(`AgenticCommerce.sol`) and a live deployment on Arc testnet. Our money model
already matches it, down to the platform fee being basis points taken on
completion.

We deploy against that shape and solve the one gap it does not cover: a research
run spends over time, so the budget has to come out in pieces rather than all at
once.

## ERC-8183 → Dr. Nib mapping

| ERC-8183 | Dr. Nib |
|---|---|
| `client` | the user (pays) |
| `provider` | Nibgate (does the research) |
| `evaluator` | the hub's JEV-gated evaluator — allowed to be a contract that performs arbitrary checks before completing or rejecting |
| `createJob(provider, evaluator, expiredAt, description)` | a new research run |
| `setBudget(jobId, amount)` | the cap chosen at configure, before any funds move |
| `fund(jobId, expectedBudget)` | the deposit; `expectedBudget` is front-running protection we get for free |
| `submit(jobId, bytes32 deliverable)` | the report, committed onchain as a hash; the text itself stays in R2/Postgres |
| `complete(jobId, reason)` | run settles; escrow released less `platformFeeBP` |
| `reject(jobId, reason)` | run ends early; escrow refunded to the client |
| `claimRefund(jobId)` after `expiredAt` | permissionless, un-hookable safety net |

Three properties we get from the standard rather than writing ourselves:

1. **The evaluator decides, not the payer.** Once funded, the client cannot
   unilaterally pull funds back — the provider is protected once work starts.
   Our evaluator is JEV-backed, so "was this worth the money" is a calibrated
   judgement, not a self-report.
2. **Fees in basis points, taken on completion only, never on refund.** This is
   our 1%, already specified.
3. **`claimRefund` is permissionless and deliberately not hookable.** A buggy or
   hostile policy can delay a refund but can never permanently trap the user's
   money. That is the guarantee we would have had to remember to build; here it
   is normative.

## The one gap: metered drawdown

ERC-8183 settles all-or-nothing — `complete` releases the whole budget, `reject`
refunds all of it. A research run does not work that way: the user prepaies a
cap, stages draw it down, and the remainder comes back when the run settles.

Three options, in order of preference:

**A. Extend `AgenticCommerce` with `drawDown(jobId, amount, stageCommitment)`.**
Permitted in `Funded` only, capped at `job.budget` minus already-drawn, called
by the provider, each call emitting a `JobDrawnDown` event. `complete` then
releases only what is left, so the terminal states stay identical to the
standard. ~40 lines, one new storage counter, one new error. The state machine
and the refund path stay untouched and auditable.

**B. One job per stage.** Conforming with zero contract work: fund a job per
stage, evaluator completes each. Real cost is product-shaped, not technical —
it breaks "prepay the cap", multiplies gas and gateway round-trips, and makes the
run's audit log a list of jobs rather than a single escrow.

**C. Meter in the database, settle onchain once.** The ledger already meters
every draw; escrow only moves at the end. Cheapest onchain, worst for the user:
funds sit in one indivisible pot, so a run that dies mid-way refunds the *whole*
thing even though the work was 80% done, and we lose per-stage solvency
entirely.

**Decision: A.** It is the smallest change that keeps the user's money
progressively, deterministically spent, and refundable at every point.

## Arc specifics that will bite us

Canonical reference: <https://docs.arc.io/arc/references/evm-differences>.

- **USDC has two interfaces over one balance.** Native is 18 decimals; the
  ERC-20 interface (`0x3600…0000`) is 6. They are the same money. Circle is
  explicit: *do not* use the 6-decimal value when crediting or recording
  balances — truncation at the 6-decimal boundary records less than was actually
  transferred. Decide which interface the escrow uses and account in its
  decimals, end to end, including the ledger. This is a bug factory, not a
  footnote; `TipHoldingWallet` is already ERC-20 6-dec, so extending it inherits
  the convention and inherits the trap.
- **Transfers to `address(0)` revert** (forbidden burn), and self-destructing a
  contract holding USDC *moves that USDC out*. A refund path must never be able
  to address zero, and the escrow must never be self-destructed.
- **Blocklist reverts consume gas with no receipt.** A blocked address fails
  opaquely; settlement needs retries that treat "no receipt" as unknown, not as
  success.
- **Block timestamps are non-decreasing, not increasing** — sub-second blocks can
  share a timestamp. Order onchain events by block number, never by timestamp.
- **`maxFeePerGas` below 20 Gwei is silently dropped** by the mempool: no error,
  no receipt, never mined.
- **Deterministic finality.** Sub-second, single confirmation is final. No
  waiting for confirmations, and no "pending" UI states.

## Relationship to what we already have

`contracts/TipHoldingWallet.sol` + `TipHoldingFactory.sol` are already deployed
on Arc testnet and mainnet, and already implement ERC-8183's terminal semantics:
factory-only `release()` (creator gets balance minus fee, treasury gets fee,
atomic) and refund to the payer with no fee. No keys, no owners.

So the plan is not "deploy something new." It is:

1. Add `drawDown` to the holding contract as the ERC-8183 `Funded`-state
   extension above, keeping `release`/`refund` as the terminal path.
2. Model a Dr. Nib run as an ERC-8183 job, evaluator = the hub.
3. Keep the database ledger authoritative for metering, with the contract as the
   enforcement mechanism — the ledger says what should have moved, the contract
   says what may, and the keeper reconciles the difference.

## Open

- **The contract is unaudited and holds real money.** Nothing here goes to
  mainnet with user funds before an external review and a testnet soak.
- Whether the escrow holds ERC-20 6-dec USDC or native 18-dec, given the
  truncation rule above.
- How the keeper handles a drawdown that succeeds onchain but whose ledger write
  fails — which side wins.