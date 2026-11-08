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

## Renewable monthly compute guard (owner approved 2026-11-08)

Broker and independently supervised watchdog use the same two public policy settings:
`DRNIB_PRIVATE_COMPUTE_MONTHLY_CAP_MICRO_USD=2000000` and
`DRNIB_PRIVATE_COMPUTE_HOURLY_MICRO_USD=58000` on each network.
These replace the cumulative canary admission limit with a UTC calendar-month
compute allowance; the legacy cumulative usage and manual grant audit are retained.
Migration conservatively charges prior cumulative use plus previously credited
runtime to the first month. Restarting a service does not renew the budget.
At a month boundary only the new month's allowance renews; earlier buckets remain.

The controller charges elapsed starting/running/stopping time, conservatively
reserves one extra billed minute per start, and stops five minutes before the
calculated limit to allow provider shutdown. New starts need a further bounded
startup reserve. The existing five-minute idle shutdown, ownership, attestation,
AI expenditure and per-run escrow limits remain unchanged. Availability polling
never starts a CVM. At the approved compute rate, $2 buys approximately 34.48 hours
before conservative reserves and prior usage. Billing is minute-based per
<https://docs.phala.com/phala-cloud/faqs> (checked 2026-11-08).

This is an application-enforced guard, not a provider billing hard cap. A provider
outage, stopped watchdog, out-of-band VM start or price change can invalidate its
cost estimate. Disk and model/search charges are separate. Do not promise $2 is a
maximum combined invoice. Reconcile the pinned compute rate against the provider
before resizing or changing it. No balance top-up or payment setting is changed.
