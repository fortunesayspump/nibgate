# Private Dr. Nib release decision

Reviewed locally on 20 October 2026. This is the release plan for owner review, not deployment or spending authorization. The target is a sequential production-hosted testnet canary, then a separately accepted mainnet rollout. The existing executable preparation remains testnet-only. Do not rename its network variables and treat it as a mainnet release.

## Current state and push boundary

The checkout is on `main`, based on `b0de629b`, with 356 changed status entries (428 changed/new files in the initial release pattern scan). This includes the accumulated migration, docs, wallet, extension and UI work. The scan found no matching provider tokens/private PEM blocks in that set; it is not a guarantee or a history audit. `ops/dr-nib-canary/local/` remains ignored, including the dedicated broker private key and owner-specific plan.

Both Railway projects still attach ordinary Dr. Nib services to this repository's `main` branch with `checkSuites: false`. Mainnet also attaches its ordinary worker and other app services to `main`. A push there can trigger live deployments without CI completion. The repository workflow is manual (`workflow_dispatch`), not a push gate. Vercel project inventory confirms separate mainnet frontend, testnet frontend, docs and subblog projects; the available project metadata does not establish their full Git auto-deploy settings. Assume a release-branch push may create previews until those settings are checked.

Push the reviewed snapshot on a `codex/` release branch first; do not use a blind `git add . && git push origin main`. Keep owner credentials, generated credential output, browser state and local exports out of Git. Merge/promote only after the network-specific services, migrations, secrets, origin acceptance and key-release policy are accepted. No push, image publication, remote service update or deployment was performed by this review.

## What deploys first: production-hosted Arc Testnet canary

1. New isolated `drnib_private_canary` database/schema and broker/guest/funding/watchdog roles, private R2 scope, backups and scoped credentials. Reuse the existing database host only if capacity and isolation pass; do not migrate a shared schema in place.
2. Nibgate-operated official dstack-verifier 0.6.1, private engine plus public evidence-only HTTPS gateway in a separate project in our Railway workspace. Proposed origin: `https://verify-drnib-canary.nibgate.xyz`. No research or payment credentials in either verifier service.
3. Publish reviewed immutable guest/gateway images. The terminal image already has a reviewed published digest. Provision one dedicated Phala `tdx.medium` with 20 GB disk, measured pre-launch script and encrypted secrets. First boot admits no research keys.
4. Independently compare the uploaded measured compose and official production OS/KMS evidence, capture app/instance identities and verifier TLS SPKI, and refresh provider privacy/price evidence. A first quote is not self-approval.
5. Deploy ciphertext broker, funding service and lifecycle watchdog using separate start commands and credentials. One active action, eight pending, five-minute idle grace, one-hour cumulative runtime. The verifier/control plane remains available while research compute sleeps.
6. Deploy a separate owner-only frontend at `https://drnib-canary.nibgate.xyz` with testnet Hub/auth, exact accepted pins, `operator-hosted` verification disclosure and required funded mode. Keep current public frontend routes unchanged until acceptance.
7. Accept real HTTPS sign-in/recovery, sleeping-worker reads, fresh wake verification, encrypted upload/intake/plan, JEV, escrow admission, authorized paid access/tips, narration/report/PDF, cumulative receipt, refund/settlement, failover and checkpoint recovery. Stop/drain afterward; inspect invoices and retained resources.
8. Promote the accepted testnet frontend configuration to the normal testnet entry point only after its own origin/auth acceptance. A rebuilt frontend must carry the same approved pins and disclosures.

### Remaining testnet release inputs

The owner bundle currently lists 14 unresolved items: guest origin; guest/gateway published digests; dedicated CVM ID; app/instance/compose/OS/KMS identities; verifier TLS SPKI; five reviewed release controls; fresh JEV/fallback workspace/ZDR/logging evidence; and the proposed $5 spending approval. Most are provisioning/review work for the agent after approval, not strings the owner needs to type. Key material is never requested in chat.

## Mainnet phase

Mainnet is a second isolated release, after testnet acceptance. Use the canonical mainnet network registry and Hub/auth origin, separate database/roles/bucket/keeper/payer scopes, approved contracts/roles/fee policy, a separate Phala worker and network-specific frontend pins. The official verifier may be shared if its exact CORS list includes both reviewed frontend origins and capacity is accepted. Never share keeper credentials or ciphertext authorization state between networks.

The private paid-source executor currently rejects every network except testnet (`private-external-executor.js`), and the canary generator deliberately rejects mainnet plans. Mainnet paid access therefore needs a reviewed network-aware implementation and regression tests before it can be enabled. Do not remove that guard merely to make a production smoke test run. Verify actual mainnet contract code/roles, purchase/tip rails, idempotent uncertain-outcome recovery, settlement/refunds and real-money caps. No mainnet paid-tool acceptance is claimed here.

Prepare a dedicated mainnet release profile and review its resulting measurements and secrets. Stage the mainnet frontend without assigning the public domain; fund and verify a tightly bounded owner-only real-money run before promotion. General user admission is a later deliberate expansion of the owner gate/capacity/budgets, not an automatic consequence of deploying this one-owner canary.

## Existing services: edit or retire only at cutover

| Existing service | Treatment |
| --- | --- |
| `nibgate-drnib-testnet` | Retain during canary; switch public testnet frontend/private routes only after acceptance; preserve access to legacy records |
| `nibgate-drnib-mainnet` | Retain until mainnet private acceptance and legacy-data/access plan are accepted; do not silently decrypt/re-encrypt old records |
| `nibgate-drnib-worker-mainnet` | Stop new legacy assignments and drain/reconcile funded jobs before retirement; never kill unresolved payments |
| `nibgate-drnib-private-synthetic` | Test-only; stop/archive after confirming no active checkpoints or unsettled test funds, retaining required financial evidence |
| `drnib-qa-verifier` / `drnib-qa-verifier-gateway` | Retire after the new pair and all dependent clients are accepted; preserve rollback until then |
| Both SearXNG services | Retain for reviewed search routes; they are sleeping, not obsolete merely because Phala is introduced |
| Existing Postgres/Redis/blog/Hub services | Do not delete or repurpose. Names or an apparently unused deployment are not proof that stored data is disposable |

The generic `dr-nib/backend/railway.toml` remains the ordinary service profile. The prepared private IaC explicitly starts broker/funding/watchdog. Changing the generic file to start a broker would break existing ordinary services and would not provision the required money/watchdog services.

Local cleanup in this review fixed the stale CI package filter (`@nibgate/drnib-backend` → `@nibgate/dr-nib-backend`) and replaced the obsolete small-worker cost/loopback-listener statements in the internal production guide. The retired prototypes and historical docs already moved/deleted in the accumulated migration remain part of the reviewed release diff. Do not mass-delete archives or live database resources to make the tree look smaller.

## Costs and approval

See `costs.json` for source URLs, dated rates and arithmetic. No fixed total invoice can be quoted before actual runtime, tokens, traffic and account credits are known.

- Phala: $0.116 per running hour; 20 GB retained disk $0.00278/hour, $0.06672/day, $2.0016 per 720-hour month even while stopped.
- Railway: CPU $0.000463/vCPU-minute; RAM $0.000231/GB-minute; volume $0.15/GB-month; egress $0.05/GB. The assumed aggregate 2 GB / 0.25 vCPU footprint is $0.034665/hour (~$25/month), not measured use. Hobby/Pro minimums and existing included credits must be checked.
- Primary Gemma: $0.15 input / $0.70 output per million tokens. JEV 1.13: $0.042 input / $0 output. GPT-4o-mini fallback: $0.15 input / $0.60 output. The fresh catalogs/docs match the code's admission prices; Azure availability/ZDR review is separate from a model-wide price listing.
- Example short test: one active Phala hour + 24 hours retained disk + one assumed control-plane hour + 1 GB DB volume for a day + 1 GB egress = **$0.272385 before AI, frontend/R2, minimums and tax**.
- At two active Phala hours/day, the same assumed per-network base totals approximately **$34.11/month for one environment** or **$68.22/month for two duplicated environments**, before AI/traffic/frontend/R2/minimums/tax. A shared verifier could reduce actual use. These are planning scenarios, not a quote or cap.

Requested first-phase allowance: **$5 incremental operator USD** ($1 AI + $1 Phala + $2 control/storage + $1 contingency), not yet approved. It does not authorize unbounded monthly hosting. Separate retained-resource cleanup/billing review is required because only AI reservation and runtime guards are enforced in the application.

Mainnet needs a separate operator allowance and an explicit real-USDC purchase/tip/escrow plus gas ceiling before execution; none is assumed from testnet approval. Test USDC is not a cloud bill. A deposit is not necessarily spent; receipts must distinguish actual provider cost, unresolved holds, platform fees, refunds and operator-funded infrastructure.

## What the owner still needs to do

- Approve or revise the $5 testnet-canary allowance and the first deployment window. A release-branch push can be reviewed separately from main-branch merge/domain promotion.
- Approve the later mainnet real-money ceiling and operator allowance after its paid-tool/network implementation and configuration review; no mainnet private launch is ready merely by approving the testnet plan.
- Rotate the previously exposed legacy RPC access token in its provider. The new configuration uses canonical public Arc RPCs and excludes that token.
- Complete provider sign-in if fresh account logging/ZDR evidence needs the dashboard, and wallet signatures for funded smoke tests. No passwords, private keys, seed phrases or recovery codes should be pasted into chat.

Rollback blocks new private admissions, keeps encrypted reads/checkpoints and money journals, drains/stops the affected Phala worker and reconciles unknown payments. It never routes private research into ordinary plaintext processing. Keep the prior frontend deployment available; restoring it must not start private work through the public backend.
