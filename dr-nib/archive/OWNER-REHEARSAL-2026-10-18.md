# Historical owner rehearsal checkpoints

Archived during the 18 October cleanup. These observations include superseded release states; use `../privacy/STATUS.md` for current facts.

# Dr Nib privacy implementation status

Audited locally on 18 October 2026. [Plan](PLAN.md) is the implementation order; [architecture](ARCHITECTURE.md) defines the target. The default frontend remains the ordinary product; explicit private builds now dispatch through ciphertext records/actions and fail closed on unmatched calls. A complete private-by-default agent is not implemented or verified end to end.

## Current reviewed test release

The dedicated guest is running for a bounded browser test window with a
thirty-minute stop guard. Image:
`docker.io/fortunesayspump/nibgate-private-guest@sha256:7c053b7ba2274b491d7bf5814d6efc05c83bdad0ef7231fd6414cf868f864dc4`.
Compose: `18ddf675e7394dc23e9f1a7cc3a5f5a42882edae44f1de09f0ef3c8f1fa53d40`.
All 299 image source/schema hashes and runtime imports matched. Fresh nonce-bound
full-verifier and production QVL checks passed; TCB is UpToDate with no advisories.
Prior independent OS/KMS/app/instance pins remain unchanged; SSH authorizations
are empty, public diagnostics are disabled, logging is `none`, and secure time
is enabled. The local browser manifest SHA-256 is
`0ad3a6fb9d2c51b32fef3c0407da946bcc30063e17693cf726b3038145fc8805`.
The local broker now advertises public retrieval. This release includes the
web adapter, shared public-source tip card, timeout/acknowledgment corrections,
low reasoning profiles and approved $0.75 AI / $0.25 infrastructure ceilings.
Real guest-side search and a completed report still require browser evidence.
The earlier stopped release descriptions below are historical observations.

## Current local migration additions

- Additive vault/client-object/action-receipt/inference-reservation schema and migration; no existing records converted or deleted.
- Transactional IndexedDB vault enrollment and recovery-code unlock; authenticated ciphertext-only synchronization and immutable project keys.
- Browser encryption of topics, intake, filenames and source files; encrypted manifest/history and report/discussion/export retrieval behind the existing screens.
- One-use verified guest action transport, owner/scoped capability checks, durable paid replay prevention and atomic encrypted manifest/receipt completion.
- Source-only protected intake/planning/writing, sampled claim judgment, report discussion and all seven existing export renderers. This is a bounded rehearsal, **not the complete adaptive ordinary agent**.
- Shared monthly conservative AI admission for both old/new confidential paths; unknown spend remains reserved. No new user payment capability.
- Restricted local tool policy; a new local guest adapter handles explicitly approved public searches. No arbitrary code/MCP/network port or remote images in private report markdown. The stopped deployed image predates the search adapter.
- Guest image built, checked against 297 exact workstation files and deployed to the dedicated owner-test CVM. Fresh full-verifier and QVL boot checks passed; this is a fixed-boot local rehearsal, not production release governance.

See [protocol](PROTOCOL.md) for exact behavior and exclusions. Private flags are not enabled on a deployed application by this change.

## Real owner rehearsal in progress

The owner authorized updating the existing dedicated Phala test guest and its
private test database without a Git commit/push or public frontend deployment.
Migration `0009_private_client_vault` and scoped broker/guest role grants have
been applied to `drnib_private_synthetic`; existing research rows were preserved.
The actual local broker and loopback SIWE proxy use the real testnet auth
service. The repository frontend is running locally, with real Chrome wallet
sign-in verified as described below. No fake account or permissive verifier is
used by this stack.

The earlier guest was briefly verified and stopped before deployment. The new
workflow image was deployed to the same dedicated owner-test CVM and is now
**stopped** after the report attempt. Its fresh
evidence passed the digest-pinned full verifier (quote, event log, OS image and
ACPI; UpToDate TCB, no advisories) and official production QVL. The local client
pins a two-hour reviewed boot manifest. Every new browser session must still
verify its fresh quote and HPKE possession proof before releasing keys.

Image: `docker.io/fortunesayspump/nibgate-private-guest@sha256:159357464680f21d1b21a53ea3f67ab10c97babc5cc1d37d8e42678f2f2da3e5`.
Compose: `b8de11507935372ec862e14a27aeacad67625ccb1d835bafe5024d92fdf37991`.
The Phala control-plane compose matches the prepared source exactly; production
OS is unchanged, SSH authorizations are empty, public diagnostics are disabled,
container logging uses `none`, and no simulator/debug/SSH secrets were injected.
The nonce-bound review-attestation endpoint remains enabled for this rehearsal.
The control plane confirmed `stopped` at the end of this test window. Any later
restart requires a fresh boot review before releasing project keys.

Live testing exposed an important release boundary: encrypted environment
changes did not change signed RTMR3. The final compose therefore pins the owner,
broker public key, inference identity and budget policy as measured literal
values. The resulting RTMR3 changed and passed fresh full-verifier and QVL
checks. See [attestation policy](ATTESTATION.md#measured-policy-versus-encrypted-credentials).

The clean-base export was stopped when it consumed excessive workstation disk.
The rehearsal uses `Dockerfile.cached-dependencies`: its immutable previous
guest base has the exact same lockfile and runtime/dev dependency manifests.
All active source directories were replaced and Prisma regenerated offline;
the final container's exact file hashes and actual module imports were checked.
The independent clean-base release/reproducibility work remains open.

An actual workstation ACI preflight subsequently passed production identity,
the independently configured compose pin and live serving-session discovery
without dispatching inference. The gateway lists `qwen/qwen3.8-27b` as TEE
served with bare 64-hex session IDs. Its current price metadata is $0.20/M input
and $2.50/M output, above the older local configuration; release preparation
requires explicit reviewed price ceilings. The owner subsequently approved
$0.25 for AI and $0.25 for infrastructure for this dedicated E2E rehearsal;
these limits are literals in the newly verified measured compose. AI admission
remains conservative; the infrastructure timer is best effort, not a provider
billing guarantee.

Real Zerion/SIWE sign-in succeeded in the installed Chrome browser at
`http://localhost:3001`: both signature verification and authenticated session
read returned 200. The embedded browser's Phantom bridge reported a disconnected
extension port; Chrome also reported a conflicting `window.ethereum` injection
from Phantom. Google social login still times out and is not verified fixed.

Latest local checks: all 266 privacy/crypto/release tests, the complete 388-test
backend suite against disposable PostgreSQL (including five private workflow tests),
and the full frontend TypeScript check passed. Browser work found
and fixed JSONB key-envelope comparison and intake-answer prompt propagation.
Real Chrome completed recovery-code vault enrollment, created an encrypted
project, passed the guest HPKE possession handshake and completed one real
receipt-verified inference. Its accounted usage is 9,344 micro-USD. The action
failed afterward and remains durably uncertain; it is not automatically replayed.
A prompt/validator mismatch for hyphenated intake keys was found and fixed, but
the original exception was not retained, so its exact cause is unconfirmed.
New uncertain actions retain only an allowlisted error code inside an encrypted
receipt. No provider response or exception text is logged.

The former storage-unavailable error was an outdated owner-test
restriction; a separate service-unavailable message occurred during an intentional
local broker pause. Both have been corrected, with distinct UI error messages.
Project-list failures were also observed before broker authentication; a retry
restored the real encrypted project in Chrome. The private UI now distinguishes
failed loading from an empty list and distinguishes Hub account-check errors
from private storage failures. Full source-to-report browser E2E, real exports
and cross-device recovery remain unverified.

## Prompt parity and verified upload (18 October 2026)

The current measured guest reuses the existing `generateIntakeBatch`,
`generateThinking`, `generatePlan` and `generateReportLong` functions through
an action-scoped private provider port. No ordinary router, provider API key or
network fallback is reachable from that port. Expired scopes fail closed. Report
assembly includes the existing introduction, sections, conclusion, abstract and
references; private runs reject section fallbacks. This restores generation
behavior, **not full adaptive-agent/tool parity or proven model quality parity**.
The configured model remains `qwen/qwen3.8-27b`. Research stages use high effort
and larger reasoning/output allowances; intake and brief acknowledgements use
non-reasoning output. Model calls within an action are serialized, and an unknown
call outcome closes further dispatch rather than repeating paid inference.

Real Chrome completed the third intake and saved encrypted answers. Its encrypted
source upload reached the dedicated R2 bucket. A read-only audit found one
AES-GCM source envelope and no plaintext source canary or filename in the R2
object or database source row. Browser reload recovered the project, answers and
source using the existing local vault. Download-original decrypted in Chrome;
byte-for-byte filesystem verification was not possible because macOS denied
access to Downloads. These checks do not establish physical second-device recovery.

Real Hub checks have intermittently failed before guest/model dispatch. The local
broker uses a bounded 15-second check and coalesces simultaneous checks for the
same session without caching completed authorizations. Restarting Codex stopped
its local server processes; restarting those processes restored access without
changing project data. A Chrome-autofilled project search also hid active projects;
clearing the filter revealed them, with no restoration or deletion performed.
Real Chrome subsequently completed a two-step plan using the shared generator,
with all three saved intake answers reflected in its scope. Its receipt-verified
model call ran from 15:47:57 to 15:48:23 UTC; the complete action took about 28
seconds. This establishes a real private plan, not report quality parity.

The subsequent execute action became durably uncertain at 15:49:52 UTC. Four
verified calls account for 28,013 micro-USD; one unknown call retains a 64,288
micro-USD reservation. No automatic replay or reservation release was performed.
The screen separately encountered a Hub `UND_ERR_CONNECT_TIMEOUT` while polling
its receipt. A workstation database connection also failed transiently, then
succeeded. These are separate observations; they do not prove the cause of the
worker failure. Its diagnostic remains encrypted. Full source-to-report quality,
discussion and export browser checks remain incomplete.

The private vault dialog now unmounts its password field while closed, and project
search uses a search input with autocomplete disabled, addressing the observed
Chrome autofill interference. The frontend TypeScript check passed afterward. Chrome native control subsequently
timed out twice; the owner was asked to bring the localhost test tab forward so
the encrypted diagnostic can be read. The Phala guest was stopped and its stopped
state was independently read back; local frontend/broker servers remain available.

## Code inventory

Paths below are relative to the repository root.

| Area | Existing code | State and next action |
| --- | --- | --- |
| Browser HPKE and evidence | `frontend/src/lib/dr-nib-private-{crypto,verifier,verification,qvl,worker-key}.ts` | Keep and integrate with durable project keys and independent client/release policy |
| Vault foundation | `frontend/src/lib/dr-nib-private-vault.ts` | New local WebCrypto core: random vault/project keys, encrypted recovery and project-key envelopes. Core plus transactional IndexedDB, owner ciphertext APIs and enrollment/recovery dialog; passkey integration remains open |
| Old recovery/cache | `frontend/src/lib/dr-nib-private-{key-store,wallet-key}.ts` | Retained for compatibility/migration. IndexedDB prunes at 25 entries and stores state-key material; wallet signature derivation is not the selected new vault design. Do not rely on this as durable production recovery |
| Experimental orchestration | `frontend/src/lib/dr-nib-private-{api,runner,recovery,sources,interaction}.ts`; `ConfidentialRun.tsx` | Retained, legacy tab-local path retained; new records/actions integrate the existing screens; not the final familiar product journey |
| Ordinary upload/intake | `dr-nib-api.ts`, `SourceManager.tsx`; `dr-nib/backend/src/sources/routes.js`, `routes/runs.js` | Current product sends ordinary file/intake plaintext. Explicit private builds intercept transport; default/live plaintext product is unchanged and must not claim upload confidentiality |
| Older encrypted upload seam | `encrypted-source.js`, `attestation.js` and `/sources/encrypted` wiring | Deliberately fails closed. Do not change the verifier stub into an approval or remove API behavior during hygiene |
| Classification guards | `dr-nib/backend/src/privacy/guard.js` and ordinary worker/tool/route checks | Keep; prevent confidential/unknown rows from entering plaintext execution |
| Sessions and capabilities | `guest-session.js`, `private-capability.js`, `private-guest-http.js`, `phala-quote.js`, `phala-verifier.js` | Keep; bounded guest identity/key-possession, owner/scope and session gates. Synthetic tests do not prove live hardware identity |
| Sealed persistence | `sealed-payload.js`, `private-worker-store.js`, `private-worker-key.js`, `private-worker-events.js` | Keep; client-held state-key bridge and encrypted state/stage/event objects. New client-object manifest workflow is separate; complete adaptive application call graph not migrated |
| Earlier repository port | `private-repository.js` | Tested but no runtime callers. Retain its independent crypto/context coverage; prefer `private-worker-store.js` for migration and retire only after coverage review |
| Bounded guest job | `private-demo.js`, `private-plan-session.js`, `private-{plan,write}-stage.js`, `private-guest-main.js` | Keep; source-only plan/write composition. Not the complete research loop or ordinary report-length parity |
| Verify prototypes | `private-verify-*`, `private-support-*`, `private-verified-completion.js` | Protected pieces with tests, not composed into the main guest source-only job. Integrate with source/claim semantics and completion policy rather than assuming verification is already wired |
| Confidential AI | `phala-aci-adapter.js`, `phala-ai-port.js` | Verified-channel/receipt adapter; compatibility, required upstream facts, model quality and current SDK protocol require review before live use |
| Execution recovery | `private-execute-journal.js`, `private-run-admission.js` | Keep; owner/classification, single execution and fixed-status recovery. Not a whole-engine crash-resume guarantee |
| Budget/accounting | `private-ai-budget.js`, `private-broker-money.js`, `private-money-route.js` | Keep reservations and receipt-bound usage. Broker draw is best-effort; durable reconciliation and full settlement parity remain open |
| Broker and lifecycle | `private-broker*.js`, `phala-{wake-bootstrap,wake-controller,lifecycle-api,broker-attestation}.js` | Keep active broker-wired controller; production hard billing limits and restart key release remain separate work |
| Packaging | Digest-pinned image and measured compose deployed and verified on the dedicated test CVM | Cached dependencies and exact source hashes checked; independent clean-base reproducibility and production release governance remain open |

## Verified locally

- Before cleanup, all 233 backend privacy Node tests passed on this device.
- Removed the unused generic `on-demand.js` and its eleven prototype tests. The replacement `phala-wake-controller.js`, bootstrap and broker-wake suites remain intact.
- Added seven vault tests covering serialized recovery/project-key round-trip, key isolation, tampering, identity/purpose/version binding, malformed input, fresh material and absence of an identity-only recovery bypass.
- The combined local command `pnpm test:drnib-privacy` passed all 229 tests: 222 retained backend tests plus seven new vault tests. No failures, skips or cancellations.
- The targeted vault TypeScript check and full frontend TypeScript check both passed. The full check initially found an ignored stale Next dev validator referencing a deleted `about` page; removing only that generated type cache resolved it. Workspace integrity and whitespace checks passed.
- A temporary loopback-only browser fixture passed seven checks in the Codex browser: secure context, non-extractable vault key, serialized project-key recovery, wrong-project rejection, tamper rejection, wrong-recovery rejection and ciphertext-only serialized storage. The fixture and browser tab were stopped/closed afterward. This is browser crypto verification, not actual second-device enrollment or browser-to-worker upload E2E.
- Passkey enrollment, actual second-device pairing, remote object storage, complete browser research screens, real model quality and hardware E2E remain unverified. Current test results are recorded below.

## Earlier remote observations

Read-only checks earlier on 18 October found a running production-OS guest and enabled isolated broker; no completed research job was verified. An earlier ACI receipt probe is documented in archived notes. Neither observation establishes that the current local source, cloud image, client release and complete flow match. No remote state was changed during hygiene.

## Removed or archived

- Deleted `frontend/src/components/dr-nib/PrivateResearch.tsx`: a standalone demo with no imports or mounted route, overlapping the intended single product flow. Its recovery libraries remain for migration; no saved records or keys were deleted.
- Deleted `dr-nib/backend/src/privacy/on-demand.js` and `on-demand.test.mjs`: unused first lifecycle prototype, superseded by the broker-wired Phala controller.
- Moved current privacy docs into this directory. Archived the earlier full-migration map, minimized-JEV decision proposal and dated cost/provider research. See [archive index](../archive/README.md).
- Preserve ordinary pipeline behavior, schemas, encryption formats, endpoints and existing data. No credentials, generated assets, cloud resources or unrelated product files were cleaned up.

## Release gaps

Durable client vault/enrollment; encrypted upload and private intake; complete worker and decision migration; tool egress; encrypted history/exports; accounting reconciliation; restart-independent key release; independently verifiable client delivery and upgrades; browser/hardware E2E; paired quality evaluation and security review. See [the phase gates](PLAN.md).

## Current local checks (18 October 2026)

- 238 crypto/privacy Node tests passed, including browser/Node object-envelope interoperation, tampering/context substitution and canonical JSONB digest checks.
- New disposable loopback PostgreSQL integration: five tests passed, including the checked-in migration and its SQL-only constraints. The synthetic flow traverses broker → signed capability → guest HTTP → HPKE decryption → real encrypted database/object records → intake/answers/plan/report/discussion → seven real export renderers → recovery from saved ciphertext. Model and quote fixtures are explicit, synthetic and test-only. Private buckets are represented by an in-memory ciphertext adapter; this is not real R2 verification.
- Database scenarios cover owner denial, CAS races, duplicate vault enrollment, unresolved-action edit/delete locks, completed receipt replay without extra inference, sanitized failure with retained uncertain state and conservative concurrent admission.
- Eleven real-browser WebCrypto/IndexedDB checks passed: non-extractable CryptoKey structured-clone persistence, transaction completion, immutable project enrollment, page-reload recovery, independent recovery context, wrong account/key/project denial and ciphertext storage. This is a new key context in one browser, not physical second-device testing.
- Frontend TypeScript check passed after integration. The full disposable-Postgres regression suite passed all 388 tests across 53 files. After the final claim-evidence, key-cleanup and router-isolation fixes, the affected three suites passed again (nine tests), all 238 privacy/crypto tests passed, and the full frontend typecheck, workspace integrity and whitespace checks passed. The temporary browser fixture and tab were closed.

The 0008-only budget migration remains compatible: installations without the workflow table cannot dispatch the new workflow, while installations with it combine reservations under one lock. Disabled record enrollment does not shadow the existing broker routes. Private action fingerprints use a keyed HMAC rather than a guessable plaintext hash.

## Real Phala connection check (18 October 2026)

At the owner's explicit request, the mock browser stack was stopped and the actual repository frontend was started on loopback port 3001 with the real private broker URL. The existing Phala owner-test guest was initially stopped; it was started for a bounded check and stopped again afterward. No Git push, guest image change, public frontend deployment or remote schema mutation occurred during this check.

- Real guest health returned `privateReady: true, fullReady: true`; it does not advertise the new action workflow.
- Fresh nonce-bound hardware evidence passed the pinned official dstack full verifier (`0.6.1`, digest `9f2c07a94efd3d8a1a89268e5faa35e91e3cb345b9c4ab859c86d35142f4f788`): valid quote, event-log replay, OS image hash and ACPI checks; TCB `UpToDate`, no advisories. This is real hardware evidence, not proof that the new migration is deployed or that paid inference/report delivery completed.
- Read-only remote schema inspection confirmed `PrivateVaultRecord`, `PrivateClientObject`, `PrivateActionReceipt` and `PrivateInferenceCall` are absent. The new browser workflow cannot run on that old deployment by changing only a proxy URL.
- Browser testing of the isolated copy found and fixed another JSONB-order issue: immutable wrapped project keys now compare exact envelope/context fields rather than serialized property order. A regression test covers this distinction.
- The owner clarified that Phala CLI updates are separate from a Git push. Preparing a digest-pinned guest image, additive private test schema/grants and a real SIWE localhost proxy is in progress. No claim of completed live browser E2E is made.

## Saved report diagnostic review

After Chrome control recovered, the client decrypted the saved execute error as
`PRIVATE_REPORT_GENERATION_FAILED`. The shared report assembler had masked the
earlier private AI failure when rejecting fallback sections; the exact original
AI failure is not recoverable from that saved receipt. The bridge now preserves
the first sanitized failure, and the AI port assigns fixed failure-phase codes
for future encrypted diagnostics. Fourteen targeted tests and all 266 privacy,
crypto and release tests passed. This correction is local pending a newly measured
guest image and another real report test. The old uncertain receipt and cost
reservation remain unchanged.

The diagnostic correction was subsequently packaged, with 297 exact source/schema
file hashes and real runtime imports checked. The dedicated guest was updated and
passed fresh full-verifier and production QVL checks against independently
computed compose policy, prior reviewed OS/KMS/app pins and a fresh nonce. SSH
authorizations remain empty; public diagnostics and container plaintext logging
remain disabled. A new thirty-minute stop guard is armed for this repeat test;
the local client pins the reviewed manifest whose SHA-256 is
`28661d67871d7fbfc506fd667a9e47e8750a0bfc963615d0dbf927544be5c5d9`.
The 388 backend tests and frontend TypeScript check passed again.

## Repeat test and timeout findings

The diagnostic guest repeated real browser intake, answer acknowledgement and
encrypted upload successfully in a separate project. Its acknowledgement took
about 50 seconds for 312 micro-USD. The next planning attempt failed with the
client-decrypted category `PHALA_PRIVATE_AI_COMPLETION_FAILED`: identity and
serving-session discovery had passed; the completion stage failed. No report
was produced, and no failed private action was reset or replayed. The guest
was stopped and the control plane confirmed `stopped` after the repeat test.

A separately metered, public-only workstation probe received HTTP 200 and
passed the response-receipt path, but `PRIVATE_WORKFLOW_USAGE_INVALID` rejected
its accounting metadata. The exact counter mismatch is still under investigation;
no source, document name or project key was sent in these public probes. Other
probe attempts failed before inference: SDK preflight aborted at its default
ten-second limit, attestation collateral fetching intermittently failed, and
the diagnostic Prisma client hit connection/transaction acquisition timeouts.
A TCP probe reached the database, and a read succeeded with a bounded twenty-
second connect timeout, so these observations do not establish a database outage.
Unknown reservations remain conservative; the original spending cap is unchanged.

Further local corrections, **not yet in the deployed guest image**:
- ACI attestation/PCCS timeout is thirty seconds; pinned completion requests have
  an explicit three-minute abort deadline. Neither setting relaxes verification.
- The private acknowledgement supplies `{prompt: ...}` to the shared generator
  instead of a string, so it no longer substitutes an unknown question.
- The timeout changes passed all 267 privacy/crypto/release tests and all 388
  backend tests. The acknowledgement-specific regression passed separately.

Full report quality, real discussion/exports and physical cross-device recovery
remain unverified. The private agent migration is not production-ready.


## Public tools integration — local code, not yet guest deployed

The guest now wires the bounded Wikipedia/OpenAlex/Crossref adapter. Only the
visible user-approved search brief leaves the protected workflow; uploads and
history are not adapter inputs. Search runs in parallel, mixes providers,
validates public destinations, limits extraction and marks excerpt-only evidence.
The UI replaces the old rehearsal label with a capability-gated live-search
checkbox and a short disclosure. Existing public-source tipping uses the shared
Hub/wallet card with user wallet approval and a minimized public URL payload;
there are no autonomous worker payments or new Hub endpoints.

A real public-only search returned six sources in 4,015 ms on this workstation,
including fetched pages and scholarly search excerpts. This verifies actual
provider connectivity outside the TEE, not guest-side search or full report E2E.
The updated code passed 277 privacy/crypto/release tests, 388 backend tests, and
frontend TypeScript. The stopped deployed guest image does not contain these
changes, and the running broker has not enabled the new web capability.

A separate receipt-verified public probe exposed the token mismatch precisely:
`max_tokens: 512` with high reasoning returned 8,199 completion tokens and cost
20,526 micro-USD by the conservative rounded receipt-bound cost. It remains
reserved because the existing token contract rejected it; it was not silently
reclassified as a successful workflow call. A read-only ledger audit now totals
246,621 micro-USD in committed costs plus conservative reservations against the
250,000 micro-USD AI limit. Only 3,379 micro-USD remains available for admission,
which cannot fund another conservative research call. No cap was raised and no
unknown reservation was released. Further paid testing needs additional explicit
allowance or auditable reconciliation evidence. The Phala guest remains stopped.


The owner subsequently approved **750,000 micro-USD for AI and 250,000 for
infrastructure ($1.00 combined maximum)**. Additional public probes retained
all failed/uncertain reservations. The route rejected an explicit reasoning
`max_tokens` object as an unsupported request representation. A `low` effort
probe then completed successfully: 110 input tokens, 39 completion tokens,
receipt-bound rounded cost 120 micro-USD, finish reason `stop`. Local research
profiles now select `low` rather than `high`, with the same strict total-output
meter and unchanged research prompts. This establishes request/receipt/accounting
compatibility for that probe, not report-quality or model parity. No failed
project or reservation was reset. A fresh real Hub identity check in the signed-in
Chrome profile confirmed the same dedicated test owner before release preparation.
