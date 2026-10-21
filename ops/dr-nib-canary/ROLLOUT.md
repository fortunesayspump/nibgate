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

The existing gateway update is live after the owner applied it in Railway. Exact-origin CORS and rejection checks passed; historical real hardware evidence passed full quote/event/OS/ACPI verification with UpToDate TCB. New-boot session freshness and recipient-key possession remain required. The reused broker and two required funding/watchdog services are live with reviewed caps and scoped variables. The delayed-start reconciliation image is live on the broker and watchdog; both deployments succeeded and the broker health check passed. The guest and funding image remain unchanged.

The Phala CLI's `--prepare-only` flag applied the managed-KMS update directly (it only defers on-chain KMS updates). The worker was explicitly stopped and its stopped state confirmed. The uploaded compose and pre-launch script match local reviewed bytes; production OS/KMS, empty SSH authorization, digest pins and disabled public/container plaintext logs passed control-plane review. Reserve the short update window conservatively in cumulative runtime and operator accounting; do not label the reservation as an actual charge. Broker startup checks also found and fixed dotenv escaping of structured release-policy JSON before applying the staged service profiles.

Railway currently displays a past-due subscription warning. Existing outstanding bills are outside the incremental canary allowance and require owner review; the warning was not established as the cause of connector approval cancellations.

Mainnet paid-tool support is implemented locally with separate opt-in, a bounded operation ceiling, canonical Hub/chain/Gateway matching and network-bound Circle reconciliation. Fourteen focused payment tests and 446 privacy/tool tests passed without live mainnet payments. Testnet configuration explicitly disables mainnet paid tools and sets their ceiling to zero. This is implementation evidence, not mainnet acceptance.

## Canary observations and legacy retirement

The owner selected the original test wallet ending `03d2c`; another signed-in wallet was correctly denied by the owner gate. Browser recovery setup completed without the agent reading its code. Project-list reads left Phala stopped. One initial wake failed closed; a diagnostic wake plus fresh full quote and recipient-key possession passed in 75.839 seconds. This is one observation, not a latency percentile or SLA. The same encrypted draft resumed and intake completed. The owner uploaded the encrypted public fixture and funded escrow job 55 with 0.25 test USDC. The same run completed a cited report and PDF; independent Arc Testnet reads confirmed both settlement transactions and a 0.243066 USDC refund after 0.006934 USDC of research usage. Mainnet paid-tool health remained false. The PDF was rendered and visually inspected on both pages. This is not full acceptance: the model twice proposed an unsuitable JavaScript action instead of the requested Python terminal, and hosted creator assessment returned unavailable, so no terminal execution or creator tip occurred in this run.

The broker/watchdog update reconciles a lost/5xx start response by reading the provider's state, without sending another start. It retains quarantine if accepted startup cannot be established. Twenty-eight lifecycle checks and an exact 394-file image/runtime check passed. The control image is separate from the already reviewed guest image, so this control-plane update does not change guest attestation pins. Follow-up local fixes pass the confirmed deposit amount through the funding callback and reserve the bounded agent decision allowance after mandatory direct URL reads for new journals, preserving legacy checkpoint ordering. The agent fix is packaged with the creator-worker deadline/queue recovery fixes in image `sha256:12b7ef9a326b8919ed7a338bf51590c3dab4791bb8a6de543b7d1d8a74cab952`. The exact 395-file runtime check and all 419 privacy tests passed. The packaged detector recognized the real Heinz article under the same 256 MB memory ceiling. The Phala update was compared byte-for-byte against reviewed compose/pre-launch inputs; production OS/KMS, app/instance, empty SSH authorization and disabled public logs were confirmed, then the worker was stopped. The owner applied matching broker/watchdog pins and the funding image in Railway; all three deployments succeeded. The release-branch frontend pin is updated for the next preview build. Fresh boot attestation, live terminal execution and creator-tip acceptance remain required.

`drnib.nibgate.xyz` is the existing ordinary mainnet API still used by mainnet frontend rewrites. A read-only audit found 183 legacy projects, zero actively running jobs and one unsettled deposit/escrow reference. Its observed one-hour CPU/RAM average illustrates approximately $2.07/month of compute, excluding database/storage/traffic/subscription differences; this is existing baseline usage, not new canary spending. Preserve that API and records until mainnet cutover and onchain reconciliation. Do not retain a second active mainnet backend indefinitely after acceptance. No mainnet resource was changed. Two unrelated queued subblog preview builds from the release push were cancelled to avoid unnecessary build use.

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

The remaining owner actions are applying reviewed service changes if the connector continues cancelling, wallet signatures when the funded canary is ready, and rotation of the previously exposed legacy RPC token through its provider. Canonical public Arc RPCs replace that credential URL in the canary. Never paste passwords, wallet keys or recovery codes into chat.

## Rollback and repository boundaries

Block new admissions, preserve ciphertext/checkpoints and money journals, reconcile uncertain operations, then drain and stop the affected worker. Never route private work into ordinary plaintext processing. Keep old frontend deployments and legacy data available during review.

Ordinary Railway services remain linked to `main` without a CI completion gate. The repository CI is manual. Keep follow-up commits on the release branch; a push to `main` can deploy unrelated services. The generic backend Railway profile still starts the ordinary service; private entrypoints use their separate profiles. Owner credentials and generated secret output remain Git-ignored.
