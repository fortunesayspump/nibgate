# Canary deployment review

Verifier implementation and hosting decision: see [Official Phala verifier selection](VERIFIER.md). The engine is the official digest-pinned dstack-verifier, not a Nibgate implementation.

Prepared locally for the owner on Arc Testnet. No deployment, image publication or new spending is authorized by this document. Mainnet launch is outside this canary's scope.

## Local fixes and artifacts

- Separate broker/funding/watchdog entrypoints, explicitly scoped database roles and funding listener.
- Canonical testnet Hub origin pinned for frontend sign-in, funding, tips, ratings and discovery. Frontend public API origin no longer defaults to mainnet in this profile.
- Reuse existing broker/verifier services and host; optional fresh-project IaC is disabled by the owner reuse plan. Separate funding/supervision services are added only where necessary.
- Full-verifier gateway with exact browser origins, bounded evidence and fixed upstream; local container built and checked without external networking.
- Offline candidate-compose generation separated from final admission, avoiding a new-CVM identity dependency cycle.
- Source/bundle integrity verification, fresh-schema SQL, environment-name inventory and local guest repackage command. Local image IDs are not registry manifest digests or hardware measurements.

For the existing owner setup, [reused inputs and remaining owner actions](REUSED-INPUTS.md) identifies what is already resolved. The table below is the complete deployment checklist; it does not mean every value is still unknown. The owner-specific `local/prepared/readiness.json` is the current unresolved release list.

## Deployment input checklist

| Input | Where it belongs | How it is obtained |
| --- | --- | --- |
| `ownerTenantId` | Plan and all owner gates | Verify the intended testnet account ID; wallet address is not interchangeable |
| Frontend, broker, funding, verifier and guest HTTPS origins | `origins.*` | Select domains and target services; guest origin may be assigned during CVM provisioning |
| Frontend project and control-plane project/environment IDs | Deployment target record | Existing platform inventory or approved new resources; separate canary target |
| Nibgate-operated official verifier, engine private URL and certificate | Gateway config and release review | Reuse existing testnet verifier pair, private engine and exact browser CORS; operator-hosted trust explicitly disclosed |
| Fresh Postgres database, administrator and four independent login credentials | Database setup and service secrets | `drnib_private_canary`, `drnib` schema; broker, guest, funding and watchdog roles; apply fresh SQL transactionally |
| Private object bucket, endpoint and scoped key pairs | Broker/guest secrets | No public bucket/URL; verify scope and retention |
| Broker Ed25519 private key and matching base64 SPKI public key | Broker/watchdog secret and measured guest policy | Generate/provision securely after review; private key never in frontend/compose literals |
| Scoped Phala lifecycle key | Broker/watchdog secrets | Scope to the dedicated canary CVM where platform permissions permit; otherwise document residual scope |
| Phala inference credential and verified gateway origin | Guest secrets / `release.aciGatewayOrigin` | Select existing authorized confidential serving route; do not silently relax verification |
| JEV and fallback credentials, workspace IDs and <24h logging/ZDR reviews | Guest secrets and `hostedReviews.*` | Verify actual key/workspace match, prompt/output logging off, broadcast off and required provider route |
| Current input/output model-price ceilings | Guest measured policy | Check approved model/provider pricing and reserve enough for bounded calls |
| Testnet escrow core/splitter/operator, keeper and agent payer | Funding service | Review existing contract addresses and roles; separate capped testnet credentials and float/gas |
| Reviewed base pre-launch script | Measured CVM pre-launch input | Required SHA-256 `982181610f70be9087b1c69b36b719b47b82d37fcef8acc9289ed3bb3095ffe8`; helper installs pinned terminal seccomp profile before Compose |
| Primary Arc Testnet RPC and optional independent backup | Funding service | Canonical registry supplies primary unless explicitly overridden; validate chain ID/code/roles before signing |
| Wallet/social-login origin acceptance and session-cookie delivery | Frontend/auth acceptance | Verify the chosen HTTPS canary origin with existing login configuration; do not copy backend credentials to browser builds |
| Provider budgets/alerts, retention and shutdown policy | Operator controls | Confirm account plan/quotas and review window; the owner approved the $5 incremental testnet allowance |

Every generated environment variable and whether it requires provisioning is listed in `prepared/deployment-inputs.json`. Secrets remain absent, not “missing from code.” Existing credentials may be reusable only after scope/workspace verification; this preparation has not exported or copied them.

## Exact missing pins

| Plan field | Expected format | Review stage |
| --- | --- | --- |
| `release.guestImage` | Immutable guest registry `@sha256:` digest | Before CVM boot; local source/dependency verification, then approved publication |
| `release.terminalImage` | Immutable terminal registry `@sha256:` digest | Before CVM boot; exact source/runtime check |
| `release.gatewayImage` | Immutable verifier-gateway registry `@sha256:` digest | Before verifier deployment; local built image is not a published digest |
| `release.aciComposeHash` | 64 hex characters | Verify the separate confidential inference deployment |
| `cvmId` | Provider CVM identity | Existing stopped CVM metadata; review updated boot independently |
| `release.appId` | 40 hex characters | Review reused CVM/application identity |
| `release.instanceId` | 40 hex characters | Review reused instance identity |
| `release.composeHash` | 64 hex characters | Independently validate exact uploaded measured compose |
| `release.osHash` | 64 hex characters | Review approved production OS image, corroborate live evidence |
| `release.kmsId` | Even-length hex | Review key-provider identity, corroborate live evidence |
| `release.verifierSpkiSha256` | 64 hex characters | Independently verify verifier HTTPS certificate public-key hash |
| `release.controls.*` | All five reviewed assertions true | Verify production OS, SSH/debug off, plaintext logging off, immutable image pins |

The terminal seccomp profile is already pinned to `ca6d1a088eb076d4b53e395b4c30574dd16cf69598c34eea4728cdba61a95b73`. It must be installed through the measured pre-launch script, not by manually changing the host. The base pre-launch script bytes are still an input.

The upstream full-verifier image is already explicitly pinned in the recipe to `sha256:9f2c07a94efd3d8a1a89268e5faa35e91e3cb345b9c4ab859c86d35142f4f788`. This is a configured digest, not evidence of an independent operational review. Its provenance and service operation still need acceptance.

Some pins cannot truthfully be filled before an approved deployment/boot. The first boot is a restricted review stage: no research keys are released and no customer research is admitted. The full quote checks TCB status, event log, OS/ACPI, app/instance/compose/KMS identity and session/recipient binding. The browser and broker reject unknown identities. Do not auto-accept the first quote and call it verified.

## Deployment set and order

1. Isolated Postgres/private bucket and scoped credentials.
2. Nibgate-operated official full-verifier engine and HTTPS gateway in the existing Railway workspace.
3. Existing Phala `tdx.small` candidate, 20 GB disk, guest plus isolated terminal companion. This shape is a cost/capacity proposal; validate image footprint and runtime capacity before acceptance.
4. Review live identity, image/compose/OS/KMS evidence and verifier certificate. Complete the release plan and refresh hosted-route privacy evidence.
5. Ciphertext broker, funding/public-tools service and independent lifecycle watchdog, using the matching env profiles only.
6. Separate testnet frontend built from this source, with the exact reviewed public pins and same-origin private rewrites. No ordinary queue worker is included.
7. Owner-only browser acceptance: stopped-worker reads, wake/idle/crash recovery, funded research, JEV, disclosed external tools/tips, failover, export, usage reconciliation and settlement. Measure actual wake time here. Stop/drain and inspect billing reservations before expanding.

The reviewed window starts with one active private action, eight queued requests, five-minute idle grace and one-hour cumulative CVM runtime. Existing run state remains encrypted outside the worker. See README for rollback.

## Costs

Published rates checked 2026-10-20; assumptions and calculations are in `costs.json`.

- [Phala instance pricing](https://cloud.phala.com/about/instance-types): reused `tdx.small`, 1 vCPU / 2 GB, **$0.058/hour active compute**.
- [Phala storage](https://cloud.phala.com/about/pricing): **$0.000139/GB/hour**, including while stopped. A 20 GB disk is **$0.00278/hour**, **$0.06672/day**, or about **$2/month** at 720 hours.
- [Railway container pricing](https://docs.railway.com/pricing/plans): RAM **$10/GB-month**, CPU **$20/vCPU-month**, volumes **$0.15/GB-month**, egress **$0.05/GB**. At assumed aggregate averages of 2 GB RAM and 0.25 vCPU across the control services and database, compute is about **$0.035/hour**, or **$25/month** if left running. Actual averages are not measured yet; configured limits are ceilings, not reservations or expected consumption.
- [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/): **$0.015/GB-month**, **$4.50/million Class A**, **$0.36/million Class B**, with monthly free quotas if still available. Rounding and shared-account quota matter; do not assume every incremental request is free.
- Current code-policy model prices are conservative admission inputs, not fresh provider quotes. JEV, Phala and Azure/OpenRouter usage share the proposed **$1 AI allowance**; actual reconciled calls determine charges. No dedicated GPU rental is proposed.

Illustrative short-canary scenario: one active Phala hour, retained disk for 24 hours, one control-plane hour at the assumed averages, 1 GB database disk for 24 hours and 1 GB egress totals **about $0.2144 before AI, frontend/R2 usage, subscription minimums, taxes**. It is not an all-in quote. Railway Hobby/Pro subscription minimums are $5/$20 with included usage; existing account usage determines incremental billing. Frontend usage and existing paid-plan headroom must be checked before approval. A new paid plan is not included in the usage estimate.

Incremental testnet review allowance is **$5: $1 AI + $1 Phala + $2 control/storage + $1 contingency**, owner-approved for testnet, not charged, and not a promise of a monthly hosting price. AI reservations and cumulative runtime are application-enforced; retained disk and other providers need separate spending controls. If provider quotas/minimums or a verifier quote exceed this allowance, revise the plan before authorization. Test-USDC escrow/creator float and keeper gas are separate from USD cloud/model bills. Historical holds remain a separate ledger and must not be reset to make the new canary fit.

A reviewed continuation may extend the cumulative worker guard from one to two hours within the existing $1 Phala allowance and $5 combined ceiling. Preserve the entire accumulated runtime counter and migrate the stopped lifecycle policy together with both controller configurations. The upper bound remains enforced; it is not a reset or an unlimited runtime switch. Two hours of the reviewed $0.058/hour shape is $0.116 compute, before disk, and does not increase the approved dollar allowance.
