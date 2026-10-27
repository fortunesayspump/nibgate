# Restricted guest planning: architecture, security and verification plan

Status: implementation design; deployment remains disabled until reviewed worker measurement, database migration and operator limits are configured. This change must preserve the existing authenticated flow and prior sign-in patch.

## User flow
Text-only local draft → restricted anonymous planning session → existing verified confidential worker intake → answers/configuration → genuine model-generated plan → explicit account sign-in → idempotent encrypted adoption → current-plan/input/price validation → explicit wallet funding → explicit approve/run. No login callback funds, signs a transaction, or starts research. Private uploads require account sign-in and adoption in this first release; no plaintext guest upload fallback.

## Trust boundaries
- Ordinary broker sees opaque identifiers, expiry/cap metadata and ciphertext, never question, answers, plan or content keys.
- A dedicated anonymous session is a random bearer capability, stored hashed server-side and bound to one guest principal/run. It is not an authenticated account and cannot access account vaults. Guest routes are a separate restricted namespace; existing authenticated routes stay closed.
- Reuse existing attestation, key-possession challenge, HPKE transport, workflow executor and inference/JEV ports on the SAME verified Phala worker. No separate ordinary model route or fake/local plan fallback.
- Worker authorization derives guest policy from trusted run metadata, not client-encrypted workflow state. Allow only intake, answers, finish-intake, configure and bounded plan editing. Deny execute/resume/revise/discuss/export, files, external retrieval/tools, payments, arbitrary objects and general vault actions.
- Atomic server admission includes bounded anonymous session issuance per network identity, finite session lifetime, request/action count, one inflight action, replan count and per-session cost ceiling including platform-funded calls. Existing global monthly ceiling remains; add guest-specific global admission cutoff. Unknown cost/uncertain receipt stays reserved and must not replay inference.

## Durable browser state
Use versioned AES-GCM encrypted IndexedDB records with non-extractable browser CryptoKey, per-draft opaque IDs, revision CAS and navigator locks. Persist question/answers/configuration/plan/step/pending operation IDs before navigation or auth. No plaintext prompts, keys or bearer claim tokens in URLs/localStorage. Same-browser return restores; unavailable/evicted storage honestly disables promised durable continuation. A different browser/device cannot recover a guest draft without an explicitly designed recovery transfer (out of scope).

## Adoption
Require signed-in account plus guest capability. Freeze a completed guest revision with an idempotency ID; reject active/uncertain inference and cross-account repeats. Browser decrypts guest objects and re-encrypts into fresh account project/vault/run AAD using new project keys. Never change userId on old ciphertext and never only rewrap tenant-bound envelopes. Transactionally validate the frozen source digest/revision, active target vault generation and all target envelopes; record the target run on the guest adoption receipt. Repeated same-account adoption returns the same target. Retain guest local state until readable durable target is verified; guest inference is fenced once claimed. Expired plans require explicit replan, not a silent expensive rerun.

## Verification before escrow
Require authenticated ownership/adoption completion, unexpired worker-produced plan, matching input/plan digest, current model/quote metadata, service readiness, active network/wallet and current minimum funding. Changed inputs/pricing return to explicit review. Funding preparation is account-only; wallet connection remains a distinct user step.

## Tests
- Session issuance expiry, forged/cross-session tokens, CSRF/origin rejection, session/IP/global rate and budget caps, concurrent transactions, worker action allowlist, encrypted malicious args, files/tools/escrow denial.
- Same worker verification/HPKE unchanged; platform-funded planning charged against guest caps; no fabricated planning.
- IndexedDB reload/redirect restoration, storage failure, tamper, revisions, multiple tabs, lock and uncertain-request receipt recovery; no secrets/content in localStorage or URLs.
- Adoption idempotency, concurrent claim, cross-account theft, expired guest, changed vault/source revision, re-encryption AAD correctness, loss of reply, partial failures, retained guest until target verification.
- Actual composer/intake/config/review UI with isolated mocks: guest to plan, refresh, sign-in cancel/fail/return, private-file gate, stale plan, explicit wallet/funding boundaries, desktop/mobile keyboard/focus. No real Google/wallet/model/payment calls.
- Focused tests, existing privacy regressions, root aggregate tests, frontend types/build, whitespace and independent security review; report pre-existing failures separately.
