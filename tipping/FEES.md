# Nib Tip — fee structure (confirmed: unlock parity)

Tips settle through the identical revenue machinery as unlocks
(`resolvePayTo` → creator fee wallet when hosted, `feePolicy` /
`protocolFeeFor`, split on `distribute`). Status: implemented in
`packages/nibgate/src/server/tip.js` (`resolveTipPayee`,
`createTipRequirement`, fee fields on `tipReceipt`) and live on both nets.

All cuts in basis points, taken at settlement.

| Flow | Protocol cut | Rationale | Status |
|---|---|---|---|
| Resolved (any host mode) | 100 bps (1%) | Processing only. `DEFAULT_FEE_BPS`, overridable per deployment via `NIBGATE_FEE_BPS`. | **Live** |
| Held → claimed | 500 bps (5%, = current max) | Resolution + custody + verification funnel + claim ops. Baked into each `TipHoldingFactory` as immutable `feeBps`. | **Live** |
| Payer refund (unclaimed) | 0 | Never reached a creator. | **Live** |
| Member-hub-hosted 200 / non-member direct 300 | — | Proposed tiers, **not implemented** — everything resolved currently settles at the 100 default. | Proposal |

Notes:
- `NIBGATE_FEE_BPS` configures the resolved rate; `NIBGATE_MAX_FEE_BPS` caps fee-wallet contracts (default 500).
- Unclaimed holds never expire and are never swept. Payer refunds of unclaimed
  tips are free (no protocol cut); released tips are final.
