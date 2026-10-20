# Dr. Nib owner canary — local preparation

Verifier implementation and hosting decision: see [Official Phala verifier selection](VERIFIER.md). The engine is the official digest-pinned dstack-verifier, not a Nibgate implementation.

The current owner canary reuses the existing testnet project, broker, verifier pair, database host, private bucket, Phala CVM and frontend project. Extra services are allowed only for required funding/supervision boundaries. The owner plan uses `deploymentMode: "reuse"`; generated project-creation entrypoints refuse to execute in that mode. Generic fresh-project IaC remains an optional reference, not the selected rollout.

This directory prepares an isolated, owner-only **testnet** rollout. It does not change the public mainnet services. Nothing here grants permission to push Git, publish images, create services, change cloud configuration, start Phala or spend money.

The current sequential testnet/mainnet plan, Git push boundary, service retirement inventory and owner actions are in [ROLLOUT.md](ROLLOUT.md).

## What would be deployed

| Component | Artifact / command | Boundary |
| --- | --- | --- |
| Canary frontend | Current `frontend/`, separate testnet deployment and origin | Same UI, encrypted projects, online verification, animated startup status |
| Ciphertext broker | Repository snapshot; `start:private-broker` | Session authentication, encrypted storage, admission and wake coordination |
| Funding service | Same snapshot; `start:private-funding` | Testnet escrow, bounded public tools, tips and settlement; no document keys |
| Independent watchdog | Same snapshot; `start:private-watchdog` | Lifecycle reconciliation/idle stop; never requests a wake |
| Full verifier engine | Digest in `verifier/engine.Dockerfile` | Private network only; full hardware evidence verdict |
| Nibgate verifier gateway | `verifier/Dockerfile`, separately reviewed image and HTTPS origin | Browser CORS for exact canary origin, evidence-only forwarding, no cookies |
| Existing Phala CVM | Reviewed guest + terminal digests and measured compose | Decrypts only after attestation and recipient-key possession; plaintext logs disabled |
| Isolated Postgres and private object bucket | Fresh logical `drnib_private_canary` on existing host, four distinct roles | Ciphertext and minimal financial/lifecycle metadata; existing private bucket |

The existing verifier pair is operated by Nibgate in the testnet Railway project, with no research or money credentials. `verifierTrustMode: "operator-hosted"` explicitly selects this trust model. The selected gateway origin is `https://drnib-qa-verifier-gateway-production.up.railway.app`; its canary CORS/image update is live. Official software verifies the hardware evidence, but users trust the Nibgate-operated service for its returned verdict; neither a separate project nor TLS/SPKI establishes independent operation. An independently operated verifier remains an optional stronger trust arrangement.

Actual JEV remains on the disclosed OpenRouter/TypeSafe ZDR route. Phala inference is primary; the authorized OpenRouter/Azure ZDR research fallback remains disclosed and provider-visible. Never describe every inference as hardware confidential.

## Prepare and verify offline

Use Node 22 and the existing dependencies. No credentials or account connection are needed:

```sh
node scripts/drnib-private-canary.mjs prepare ops/dr-nib-canary/plan.example.json ops/dr-nib-canary/prepared
node scripts/drnib-private-canary.mjs verify ops/dr-nib-canary/prepared
```

Output must be a new directory. Preparation snapshots the current Prisma schema without connecting to a database, adds explicit restricted grants/check constraints, produces service/environment declarations and hashes the relevant source files. Verification detects source or bundle changes. It does **not** establish remote attestation, service readiness, prices or account spending approval. The example deliberately reports missing inputs instead of inventing them.

The selected reuse rollout applies `reuse-service-patches.json` to existing services after reviewing the remote diff; generated project-creation entrypoints are disabled. For an optional fresh installation, control services use `.railway/railway.ts`; Nibgate uses `verifier/.railway/railway.ts` for the verifier pair. New Railway services use IaC (SDK `railway/iac`); native IaC evaluation requires Railway CLI 5.42.1 or later. The declaration only accepts the `owner-canary` environment, has no Git repository source or auto-deploy connection, uses one replica per service with explicit CPU/RAM limits, leaves control services awake, and disables request tracing/auto-instrumentation. Environment profiles are separate review inputs; import only the matching service's values after approval. Credentials are not embedded in the IaC file. Upload the exact reviewed repository snapshot only after approval. Do not apply this declaration to an existing project containing unrelated services without reviewing the complete remote diff.

The generated `deployment-inputs.json` lists every service environment variable by name, whether its value still needs provisioning and whether it is a public build value. It contains no credentials.

## Owner-specific preparation

See [existing inputs and owner actions](REUSED-INPUTS.md). The filled plan, provenance, credential references and candidate measured pre-launch script are under Git-ignored `local/`; private signing material stays in its owner-only `credentials/` directory. `local/prepared/` is the owner-specific bundle. `prepared/` remains the generic review example. No remote resources are created by either preparation.

## Required release inputs

Replace the example values in a new plan, then regenerate a fresh bundle:

- Verified owner account ID, dedicated CVM identity and distinct real HTTPS origins.
- Rebuilt immutable guest/terminal/gateway images, reviewed full-verifier digest, approved app/instance/OS/compose/KMS identities and verifier TLS SPKI pin. Existing stopped-worker measurements must not be reused for a new release without review.
- Independent release controls: production OS, SSH/debug off, plaintext logs off, all images pinned. Online full verification replaces the fixed-boot bundle; a verifier outage blocks key release.
- Separate database URLs, scoped object storage, lifecycle key, broker signing key and testnet payment credentials. The money/watchdog services receive no project decryption keys.
- Current evidence, less than 24 hours old, for each hosted JEV/fallback workspace: key/workspace match, ZDR, prompt/output logging disabled and broadcast disabled. Do not retain prompt content as review evidence.
- Explicit incremental operator spending approval. `budgetApproved: false` remains the default.

Generate candidate measured compose after its pre-boot inputs are reviewed (owner, image digests, confidential inference identity, broker public key, model prices and hosted-route reviews). New CVM/app/instance identities, the resulting compose/OS/KMS measurements, verifier certificate and spending approval are final admission inputs, not prerequisites for writing an offline candidate. This avoids requiring a new CVM identity before its compose exists. A generated candidate never establishes deployment readiness. Supply an owner-only (0600) JSON file with `{plan, inputs, openRouterResearchApiKey, basePreLaunchScript}`. `inputs` follows the generated `guest/compose.inputs.json`, adding exactly the six secrets accepted by `private-guest-release-core.mjs`. Use the isolated `drnib_private_canary_guest` login in the guest DSN. The tool writes a **new 0700 directory** containing 0600 `compose.yaml`, `guest.env` and `pre-launch.sh`. The base pre-launch script must match the reviewed hash in `guest/prelaunch-requirements.json`; the helper installs the pinned terminal seccomp profile before Compose starts. Configure that script as measured CVM pre-launch input, never as an unmeasured host edit. Credential output must be outside the repository. Never put the credential input or output in Git. Send environment values through Phala's encrypted-secret mechanism after approval; do not put them in measured compose literals.

```sh
node scripts/drnib-private-canary.mjs compose /absolute/owner-only-input.json /absolute/new-owner-only-output
```

Provision four independent login credentials for the generated NOLOGIN roles via the database administrator after review. Do not use an administrator account in application services. Run `database/fresh-canary.sql` with `psql -v ON_ERROR_STOP=1` against a **new database** only; the script refuses a preexisting `drnib` schema and applies transactionally. Never run generic `db push` on shared production state.

## Wake and idle policy

Project lists, saved chats/reports and receipts read encrypted persistence without waking the CVM. New questions, follow-ups and explicit resume request wake. Saved content stays visible while the workspace displays connecting, waking, then verification. A read of an old uncertain project does not start recovery. Recovery of an already explicitly started browser operation remains bounded and fenced.

The initial owner canary has one active action, eight pending requests and a five-minute idle grace. The controller checks execution leases before shutdown; an independent five-second watchdog reconciles missed shutdowns. The cumulative CVM runtime guard is one hour across restarts. Browser reconnect and fresh attestation may be needed to restore in-memory project keys after a restart. Do not promise unattended offline recovery or a measured wake time from configuration alone.

## Costs and approval

Owner-approved incremental testnet allowance, **not an invoice**:

| Bucket | Ceiling |
| --- | ---: |
| Model/JEV/fallback API calls | $1.00 |
| Phala runtime and retained storage | $1.00 |
| Control-plane hosting / verifier / database / object operations | $2.00 |
| Contingency | $1.00 |
| Total approved operator allowance | $5.00 |

AI usage has a durable reservation cap. The Phala dollar amount is a planning reserve, not a provider billing cap; the lifecycle controller enforces a separate one-hour cumulative runtime limit. Retained disk can continue billing beyond that runtime. The $2 control-plane and $1 contingency amounts are planning allowances, not automatic Railway/Vercel/R2 spending caps; inspect provider rates and configure provider budgets/alerts before approval. The five continuously running control/verifier services can exceed those planning amounts over time. Stop the canary promptly after its review window. Retained disk, database and storage may remain billable after compute stops. Do not transfer or reset previously accumulated reservations; use a distinct canary scope and reconcile old bills separately. Existing historical test authorization is not this canary's approval. Customer compute charges remain zero; onchain test-USDC escrow is separate from operator USD costs.

## Approved rollout sequence

1. Review the final local diff, source inventory, exact image digests, trust inputs, provider cost estimate and spending ceiling. Obtain deployment/spending approval.
2. Provision isolated storage and independent role credentials, apply the fresh schema and inspect grants. Configure secret scopes, owner gate and testnet endpoints before enabling routes.
3. Deploy the Nibgate-operated official verifier engine and evidence-only gateway. Check upstream readiness, browser CORS, full positive/negative quote verification and TLS SPKI. Gateway `/health` only confirms configuration, not verifier readiness.
4. Publish the approved image(s), update the existing CVM with reviewed controls and encrypted secrets, and independently review resulting measurements. Regenerate frontend/broker policy from the exact accepted release; do not blindly trust new boot measurements.
5. Deploy broker/funding/watchdog and separate canary frontend with the reviewed environment profiles. No ordinary worker runs in this canary. Check `/health` and unauthenticated/non-owner denial before owner access.
6. With the CVM stopped, read project lists/history without a start. Submit one request, observe wake/verification, measure start-to-ready and first response. Confirm shared wake, idle shutdown, watchdog recovery and unchanged cumulative accounting after restarts.
7. Execute owner-only encrypted upload → intake → plan → wallet funding → research/JEV → disclosed tool access/tip → report/export → settlement/refund. Include paused questions, restart/resume, uncertain-call fencing, forced authorized ZDR failover, second-session recovery and denied-key-release checks. Wallet signing stays with the owner.
8. Check receipts against provider/chain evidence, exports visually, storage/logs for plaintext, and every changed browser action. Confirm stopped-CVM state and record billing reservations. Only then decide whether to expand the canary.

Remote hardware, browser, payment and cost acceptance are separate from offline tests. They have not been executed by preparing this directory.

## Rollback

Disable new canary admissions first. Preserve encrypted state, pending operation IDs and receipts. Allow in-flight tools/payments to reconcile; never replay unknown paid actions or refund an unresolved purchase automatically. Drain/checkpoint and stop the dedicated CVM; confirm provider state and the durable runtime record. Stop canary control services after necessary payment reconciliation. Retain encrypted recovery material and required financial evidence; remove disposable resources only after review. The existing public mainnet services and their databases are not switched by this plan.

## Local guest packaging

`node scripts/drnib-private-local-release.mjs <immutable-cached-guest-digest> <new-canary-local-tag>` reuses dependencies only if the cached lockfile, dependency manifests, schema and source inventory match. It rejects removed/stale parent sources and mismatched execution metadata, copies only an explicit source allowlist into a temporary context, runs the build without networking and refuses an existing output tag. It never uploads. Verify the resulting tag with `scripts/drnib-private-image-check.mjs`; the terminal companion has a separate source/runtime check. A local dependency reuse build does not replace independent clean-build provenance/release review or supply a registry manifest digest.
