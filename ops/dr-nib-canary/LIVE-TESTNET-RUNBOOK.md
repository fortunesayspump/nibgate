# Dr. Nib testnet: deployed configuration and recovery

Updated 2026-11-08. This is operational documentation, not permission to deploy, rotate credentials, increase runtime, or spend. The older preparation bundles are release inputs, **not the live configuration authority**. Never copy a dated credential snapshot into a running environment without comparing it to the current authorized configuration.

## Request path

`testnet.nibgate.xyz` (Cloudflare frontend) → existing Railway testnet broker → attested Phala guest. The browser releases project keys only after verification. The broker persists ciphertext and coordinates wake/leases; the guest reads the encrypted sources and runs the research workflow. Funding, public tools and creator tips use the separate existing testnet funding service. Wallet approvals remain with the owner. Mainnet is separate.

| Component | Existing target / responsibility |
| --- | --- |
| Frontend | Cloudflare `nibgate-hub-testnet`, route `testnet.nibgate.xyz/*`; testnet chain 5042002 |
| Hub identity/API | `https://testnet-api.nibgate.xyz` |
| Private broker | Railway service `5fbee40a-78c5-46c6-9d3c-dd3bd64ad7b3`; `https://nibgate-drnib-private-synthetic-production.up.railway.app` |
| Watchdog | Railway service `dbb2d614-7719-49c8-a07b-26a00a16f800`; idle/lifecycle reconciliation, not a source of new work |
| Funding | `https://drnib-private-funding-canary-production.up.railway.app`; existing testnet escrow/tools/tips |
| Guest | Phala `cvm_YKRNRmKa`, app `c6f58feeabbaba0570e18e75ad5c71bc18fce2af` |
| Database | Existing dedicated `drnib_private_canary` database and `drnib_private_canary_guest` role; no administrator credential in the guest |
| Encrypted sources | Existing private R2 bucket; broker and guest must agree on endpoint, bucket and valid key pair. No bucket names or credentials are recorded here. |

The Railway project is `214a93db-1557-4d57-827e-098abd8c3c53`; its environment is named `production` but belongs to the **testnet project**. Never select by the environment name alone.

## Configuration authorities

- **Application source and orchestration:** reviewed Git revision plus exact guest image digest.
- **Live service credentials:** existing authorized provider/Railway configuration. Git and old local credential-recovery files are not current secret authorities.
- **Sealed guest secrets:** separately provisioned encrypted Phala environment. Updating Railway does **not** update it.
- **Trust policy:** exact measured guest/terminal/compose/OS/KMS identities must agree in Phala, broker, watchdog and frontend. Refreshing secret values must not silently change the allowed names or trust policy.
- **Budgets:** durable usage reservations, owner-approved spending ceiling and durable lifecycle runtime counter. A container restart does not reset them.

Required guest secret names (values never belong in Git or logs):

```
DRNIB_DATABASE_URL
PRIVATE_AI_API_KEY
PRIVATE_HOSTED_JEV_API_KEY
PRIVATE_OPENROUTER_RESEARCH_API_KEY
R2_ENDPOINT
DRNIB_R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The guest must be able to reach the database over its existing public TLS route; a Railway-private hostname is not reachable from Phala. Preserve the dedicated role/database/schema. The broker and guest may use different network addresses for the same database; compare identity and permissions rather than demanding identical DSN strings.

## Preflight before a real end-to-end run

1. Resolve exact project/environment/service/CVM IDs. Read active versions, in-flight updates and current release policy before any retry.
2. Compare the approved guest secret-name set with Phala `allowed_envs`. A configured compose variable whose name is absent is not delivered to the guest.
3. Compare broker and guest R2 endpoint/bucket/key provenance privately; output booleans only. Validate the intended storage permission without listing documents or printing credentials. Stop on 401/403; do not try alternate routes or grant wider access.
4. Verify the guest database transport and restricted role. Do not reset data or change role grants to fix a password mismatch.
5. Verify current provider attestation pins and the actual deployed verifier implementation. Do not guess fingerprints or disable verification.
6. Confirm the runtime window has startup reserve and enough remaining time. Preserve accumulated usage and reservations; a new allowance needs owner approval.
7. Check public readiness and then the owner flow: intake/JEV → encrypted source round trip → plan → owner funding approval → research → creator-tip proposal/owner approval → report/chat/exports → settlement. Readiness alone is not an end-to-end pass.

## Safe sealed-secret refresh

Use the existing official Phala encrypted-environment update and the approved current credential source. Do not create a new token, expand bucket permissions or change the storage target as a shortcut. The CLI environment update replaces the supplied set: preserve all eight reviewed values, change only the approved pair, keep input files mode 0600 and delete them after sealing. Clear signing-key/RPC environment variables so a routine update cannot silently sign an on-chain transaction.

Capture a sanitized command result. If a command fails, inspect supported CVM/update state before retrying; do not equate CLI failure with proof nothing changed. Secret-value-only updates can retain the same compose hash and may not create a new compose revision. Confirm by recovering the existing owner action, not by creating another project or paid request.

## Uncertain action recovery

Preserve the request ID, encrypted checkpoint, usage reservations and project keys. Use the original project's **Inspect saved operations** and **Check saved work & resume** controls. Do not click Plan again, clear reservations, delete keys or replay an unfinished external operation to bypass uncertainty. A completed checkpoint result can be restored; an unresolved operation must remain fenced until its supported reconciliation proves an outcome.

## Findings from the 2026-11-08 rehearsal

- An exhausted cumulative runtime guard initially prevented startup; two explicitly approved one-time windows were audited rather than disabling the guard.
- Testnet used an older gateway compose pin; the deployed verifier/release evidence was reconciled before changing it.
- A Railway-private database hostname could not be reached from Phala; the existing public TLS proxy was used with the same dedicated database role. Its credential also required an explicitly approved alignment.
- Two existing hosted-provider credentials were missing from the guest's allowed secret-name set; an approved sealed update corrected delivery.
- Real intake and JEV decisions then worked. The encrypted synthetic file uploaded and round-tripped in the browser.
- Planning failed before recorded checkpoint model operations. The guest's R2 pair differed from the working broker's current pair, while endpoint/bucket matched. A metadata-only request using the old pair returned HTTP 401. The owner approved replacing only the guest pair; the update was accepted. Recovery and the remaining full flow must still be verified before calling the test complete.

These are configuration-drift failures across independently deployed systems. The preparation README alone did not enforce live agreement. Keep this operational record and preflight together with future releases; do not treat a successful build or startup as proof the entire workflow works.

## Recovery verification update

The approved storage refresh was verified by recovery of the original saved action: it read the source and produced a real Phala plan (3 steps, estimated $0.03, cap $0.50). Displayed aggregate provider usage became $0.001053. No duplicate plan request was submitted. The third owner-approved 30-minute runtime window was applied with the previous grant audit preserved. No research, escrow funding or creator tip has executed yet.

The Google connection selected a wallet different from the project owner. Its sign-in signature was cancelled. Reconnect the original project-owner wallet before funding; do not rebind the project, export keys or substitute the default connector wallet.

## Intake repeat-question regression (2026-11-08)

The generic purpose/timeframe/angles/exclusions bank was a real fallback path in `private-workflow.js`, not evidence of a model-generated specific follow-up. The workflow initially prepared that bank and replaced it only when model questions were available. Its JEV stop decision received answer keys and a batch count rather than the actual answered context. The old non-private batched flow also had the count-only weakness; do not attribute all of this behavior to the privacy migration.

The tested correction removes the private question-bank substitution, supplies bounded actual questions/answers and generated follow-ups to JEV, and limits new questions to the remaining slots within eight total. Unavailable JEV or invalid opening generation stays an explicit error rather than impersonating a successful model response. Prompts require concrete subject-specific trade-offs while preserving choice-based intake. Saved projects may still contain questions already generated by the older version; deployment does not silently erase their encrypted history.

A separate synthetic Qwen confidential-inference probe verified its receipt and cost $0.000933; it did not change the configured production model. One successful sample is not a model-quality or end-to-end completion guarantee.

### Primary model follow-up

A fresh browser rehearsal after the workflow repair exposed a separate failure: the Gemma primary returned invalid intake questions after the existing formatting repair. The action stopped with no unresolved model charge; no general question bank was substituted. The receipt-verified Qwen route (`phala/qwen3.8-27b-uncensored`) passed the actual intake parser and generated bakery-specific reliability, load and financial-constraint questions in the live testnet UI. The candidate uses `PRIVATE_AI_MODEL_POOL=single`, preserves hosted JEV, and meters Qwen at the checked catalog rates ($0.30/M input, $1.50/M output); aggregate spending and runtime limits remain unchanged. Mainnet and testnet must use the same reviewed model/image policy with separate network identities/origins. Full research/report/export verification is separate from an intake pass.
