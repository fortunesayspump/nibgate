# Private Dr. Nib release decision

Updated 20 October 2026. The owner approved pushing the release branch and a **$5 incremental, owner-only testnet canary**. Mainnet deployment and real-money activity remain off pending a separate budget. Release branch `codex/dr-nib-private-rollout` was pushed at `4bc912b7`; `main` was not pushed.

## Reuse the existing installation

| Component | Selected treatment |
| --- | --- |
| Railway project | Existing `nibgate-testnet`; no new project |
| Ciphertext broker | Reuse `nibgate-drnib-private-synthetic` with scoped canary configuration |
| Official verifier | Reuse `drnib-qa-verifier`, pinned official dstack-verifier 0.6.1 |
| Evidence gateway | Update existing `drnib-qa-verifier-gateway`; retain its HTTPS address |
| Database | New logical `drnib_private_canary` on existing Postgres, four restricted roles; no new server |
| Objects | Existing private ciphertext bucket; no new public storage |
| Phala | Reuse stopped production-OS `tdx.small` CVM; no second VM or default resize |
| Frontend | Release-branch preview in existing testnet Vercel project; separate canary origin |
| Funding / watchdog | Reuse a suitable service if safe; add only if required for scoped money credentials and independent shutdown |

The two newly created empty Railway projects and undeployed Vercel project were removed. Their staged services never ran. Generated owner configuration uses `deploymentMode: "reuse"`; project-creation entrypoints refuse to execute in that mode. Generic fresh-project templates are optional reference material, not this rollout.

Preserve legacy APIs and data: the legacy database has six nonzero-budget unsettled records, which must not be assumed funded without ledger evidence. The old private database has no active or funded-unsettled runs. Existing broker/gateway variables have private rollback backups. Never retire a service merely because its name sounds obsolete.

## Current review state

The new logical database and four restricted logins exist on the existing host. Guest and gateway immutable images are published. Fresh hosted-route probes verified JEV/TypeSafe and the Azure research fallback with request-level ZDR and matched workspace credentials; prompt storage and broadcast were off. The two public synthetic probes cost $0.000017, included in the $1 AI allowance. Historical development holds remain separate.

The existing gateway needs the reviewed image/configuration update to allow the canary frontend origin. Its old endpoint rejects that origin. The deployment tool cancelled the update twice with “the user did not approve this action,” including after confirmation in chat. Nothing was deployed by those calls. Keep the patch staged; do not bypass the rejection through another deployment route.

Mainnet paid-tool support is implemented locally with separate opt-in, a bounded operation ceiling, canonical Hub/chain/Gateway matching and network-bound Circle reconciliation. Fourteen focused payment tests and 446 privacy/tool tests passed without live mainnet payments. Testnet configuration explicitly disables mainnet paid tools and sets their ceiling to zero. This is implementation evidence, not mainnet acceptance.

## Deployment order

1. Accept only the reviewed existing-gateway patch, check exact CORS, full real/tampered quote verification, upstream readiness and TLS SPKI. A healthy gateway alone does not prove valid attestation.
2. Finish scoped broker/funding/watchdog profiles. Preserve existing ordinary APIs and unsettled records. Review all staged resource changes before applying; do not create another Postgres host or verifier pair.
3. Update the existing Phala CVM with pinned guest/terminal images, measured pre-launch script and encrypted secrets. Independently compare production OS/KMS, app/instance and exact compose measurements before allowing research key release. Never approve the first quote merely because it is new.
4. Build the existing frontend project's release preview with branch-specific testnet configuration and accepted pins. Attach the canary origin without promoting the mainnet or normal testnet frontend.
5. With the worker stopped, verify encrypted list/history reads do not wake it. Measure wake-to-ready, nonce/key-possession checks and first response. Enforce one active action, eight pending, five-minute idle grace and one-hour cumulative runtime.
6. Complete owner-only encrypted upload, intake/plan, user-signed escrow, research/JEV, disclosed paid tools/tips, narration, report/PDF, receipt and settlement/refund. Include recovery and authorized ZDR failover. Wallet signing stays with the owner.
7. Drain/stop the worker, reconcile actual usage and inspect retained resources before expanding the canary. Promote the normal testnet entry point only after its own origin/auth acceptance.

## Costs and limits

See `costs.json` for dated source rates and assumptions. The reused small worker costs **$0.058 per active hour**, plus its existing 20 GB disk at **$0.00278/hour** even while stopped. Reuse avoids duplicate infrastructure; it does not make the existing services free.

The approved incremental allowance is **$1 AI + $1 Phala + $2 control/storage + $1 contingency = $5**. AI reservations include the route probes; cumulative worker runtime is guarded. Control/storage/contingency allocations are planning allowances, not automatic provider hard caps. Inspect actual provider usage and stop after the review window. Preserve historical bills/holds rather than resetting them.

An illustrative one-hour worker/control scenario, 24 hours of retained disk, 1 GB database volume for a day and 1 GB egress is **$0.214385 before AI, frontend/R2, subscription minimums and tax**. This includes an assumed full control footprint; it is not measured incremental reuse cost or an invoice. No new paid plan is approved. Customer compute charges remain zero. Test-USDC deposits are separate from cloud USD bills.

## Mainnet and owner actions

Mainnet needs separately scoped state, keys, accepted contracts/roles, frontend measurements, deployment profile and an explicit real-USDC/gas/operator allowance. No mainnet deployment or live payment follows from testnet approval. Shared verification can be retained if exact origins and capacity pass review.

The remaining owner actions are deployment-tool approval for the existing gateway, wallet signatures when the funded canary is ready, and rotation of the previously exposed legacy RPC token through its provider. Canonical public Arc RPCs replace that credential URL in the canary. Never paste passwords, wallet keys or recovery codes into chat.

## Rollback and repository boundaries

Block new admissions, preserve ciphertext/checkpoints and money journals, reconcile uncertain operations, then drain and stop the affected worker. Never route private work into ordinary plaintext processing. Keep old frontend deployments and legacy data available during review.

Ordinary Railway services remain linked to `main` without a CI completion gate. The repository CI is manual. Keep follow-up commits on the release branch; a push to `main` can deploy unrelated services. The generic backend Railway profile still starts the ordinary service; private entrypoints use their separate profiles. Owner credentials and generated secret output remain Git-ignored.
