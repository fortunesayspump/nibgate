# Private research accounting and budget policy

Updated 20 October 2026. This is the implemented accounting contract; [STATUS.md](STATUS.md) records dated development totals. Historical spending approvals live in [the archive](../archive/privacy-2026-10-20/BUDGET.md), not in current deployment instructions. No budget increase or production spending is authorized here.

## Customer budget

A plan estimate and user-approved cap precede funding. Confirmed escrow is required before paid research admission. A deposit is a maximum available budget, not an invoice or an automatic charge. Ordinary model/provider limits and the run cap apply together. Intake/planning and diagnostic sponsorship are separate from customer-funded research.

Before dispatch, each paid operation reserves a conservative allowance under the shared durable admission lock. Completed operations record the actual serving model, token counts, cost basis and provider evidence. Confidential Phala inference is receipt-reported; hosted Azure/JEV usage is provider-reported. The labels must never imply hosted inference was attested.

Unknown outcomes retain reservations and fence duplicate execution. Proven non-dispatch can release its reservation. The approved definite-429 recovery policy may preserve the full amount as operator exposure while excluding it from customer debits; this is not proof of a zero provider bill. Missing historical evidence cannot be replaced by guesses from account balances or aggregate timestamps.

## Settlement and refunds

Only matching admitted expense records become customer debits. Final settlement reconciles deposit minus charged expenses minus confirmed refunds to the remaining escrow. The 1% protocol share is taken from the operator's earned share, not added to the payer's bill. Pending refunds are shown as pending until their transaction outcome is confirmed.

A transient research failure preserves the resumable checkpoint and escrow. It must not automatically terminate/refund the job merely because an operation needs recovery. Unknown money outcomes require reconciliation before retry. Known completed calls and payments restore from their journal without repurchase. A settled run cannot acquire new charges; further paid research needs new funding.

## Receipts and activity

Each paid model/tool result includes its cost when known. The expense receipt aggregates repeated calls into one cumulative row per model/tool, with individual records available for audit. It separates customer-charged, sponsored, operator-covered, unresolved and pending expenses. Exported receipts preserve six-decimal USDC precision and settlement/refund hashes.

The receipt is an expense breakdown, not a tax invoice. A user deposit, provider reservation, published provider bill and customer debit are distinct amounts. Do not present all development commitments as actual model charges.

## Compute and storage

Phala CPU compute/storage remain operator-funded and labeled `allocation: not-metered` in customer receipts. A zero customer allocation does not mean the provider bills nothing. Disk remains billable while the CVM exists, including while stopped. API inference is a separate expense from CPU worker runtime.

Before charging customers for infrastructure, implement a versioned disclosed rate, active-run metering, atomic reservations within the approved cap and concurrency allocation that never charges the same machine interval twice. Idle grace, cold starts, deployment/debug failures, user-paused time and unallocated disk remain operator costs. Do not retroactively charge settled work. Storage needs a disclosed retention/byte-time policy before charging it.

## Operator controls

Use independent provider-bill reconciliation, durable lifecycle runtime accounting, supervised stop/watchdog processes and alerts. A workstation timer is best effort, not a provider-enforced spending guarantee. Budget renewal must be explicit; never reset durable usage on process restart or clear an unknown hold merely to admit another call. See [PRODUCTION.md](PRODUCTION.md).
