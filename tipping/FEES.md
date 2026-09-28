# Nib Tip — fee structure (confirmed: unlock parity)

Tips settle through the identical revenue machinery as unlocks
(`resolvePayTo` → creator fee wallet when hosted, `feePolicy` /
`protocolFeeFor`, split on `distribute`). Status: implemented in
`packages/nibgate/src/server/tip.js` (`resolveTipPayee`,
`createTipRequirement`, fee fields on `tipReceipt`), 9/9 tip vitest green
including revenue parity. Tiered member/non-member rates below remain proposal.

All cuts in basis points, taken at settlement.

| Flow | Protocol cut | Rationale |
|---|---|---|
| Member, self-hosted SDK | 100 bps (1%) | Processing only; creator runs infra. Matches current unlock cut. |
| Member, hub-hosted | 200 bps (2%) | Hub runs challenge/verify/receipts; creator sets destination only. |
| Non-member, direct (resolved wallet) | 300 bps (3%) | Resolution + protocol rails, no relationship. |
| Non-member, held → claimed | 500 bps (5%, = current max) | Resolution + custody + verification funnel + claim ops. |
| Nibshare / subblogs native tips | member-hosted rate (200 bps) | First-party surfaces. |

Notes:
- `NIBGATE_FEE_BPS` configures member rates; non-member rates are protocol
  constants (not creator-configurable).
- Unclaimed holds never expire and are never swept. No refunds, ever.
- Mainnet launch re-confirms every number (real money changes psychology).
