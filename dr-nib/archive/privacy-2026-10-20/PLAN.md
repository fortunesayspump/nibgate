# Historical snapshot — 20 October 2026

Superseded by [current privacy documentation](../../privacy/README.md). Preserve as evidence; do not use historical budgets, release pins or pending tasks as current instructions.

# Dr Nib privacy implementation plan

Updated 19 October 2026. Work locally on this device. No Git commit/push or public frontend deployment. The owner subsequently authorized the dedicated Phala guest/image and private test DB updates, real browser E2E and up to $0.65 AI plus $1.20 infrastructure ($1.85 combined). Preserve the current frontend appearance and ordinary product behavior while migrating behind the interface. The final target is one private-by-default agent, not separate public/private products.

## Current completion gates

This table supersedes older checkpoint wording below. A complete migration
means original workflow acceptance and privacy acceptance, not just a report.

| Gate | Current evidence | Remaining work |
|---|---|---|
| Browser encryption, owner vault, encrypted objects | Real owner upload, report and reload passed | Physical second-device recovery and conflicting-device tests |
| Attested worker and confidential Qwen | Reviewed dedicated guest and signed inference receipts passed | Release latest local worker; repeat attestation and live tests |
| Actual JEV | Native Decisions API, fixed TypeSafe ZDR route, disclosed provider visibility passed | Broader decision-quality evaluation; do not claim provider-blind JEV |
| Original intake / plan / funded report | Real source-only owner run passed | Representative topics, longer/later-page documents and paired quality/cost evaluation |
| Activity explanations | Saved proposal visible; new local encrypted explanations, observations and verification notes tested | Live acceptance on updated measured guest |
| Escrow / usage / refund | Real 0.25 deposit, 0.007348 customer spend, 0.242652 confirmed refund | Failure-path local changes and uncertainty reconciliation acceptance |
| Failure finality | Known failure and unknown-outcome locks covered | Latest paid-research failure → terminal state → automatic refund candidate needs live acceptance |
| Adaptive research / steering | Bounded propose → actual JEV → allowed tool loop; encrypted concurrent guidance and checkpointed pause/resume passed local HTTP/Postgres tests | Local round reviews, actual JEV continuation and encrypted mid-run questions implemented; browser/live acceptance pending |
| Tool parity | Evidence search, arithmetic, owner-approved public/paid tools, isolated JS; extension creator detection and protected post-report tips tested locally | Linux/gVisor core container checks pass; shared normal public search/detection bridge implemented. Native package/latency, payment and measured/browser acceptance pending |
| Recovery / memory | Encrypted operation journal, heartbeat/leases, expired-worker recovery, stale-worker fencing and uncertain-result no-replay passed local tests | Measured release/live crash acceptance, physical second-device unlock and private cross-run memory |
| Expense receipt / compute | Authoritative per-call JSON and printable HTML receipt, cumulative model/tool rows, included share and refund reconciliation; compute explicitly operator-funded | Browser/live printable receipt acceptance; metered/disclosed compute allocation before any new charge |
| Reports / versions / exports | All seven formats passed earlier owner browser run; actual ledger receipts tested | New measured release and version/discussion/recovery regression |
| Wallet / Google | Zerion Arc repair and real owner funding passed | Google/Reown loading diagnosis and alternative wallet regression |
| Default cutover / historical data | Legacy/plaintext and private modes remain classified | Owner encryption migration for old records, retention/backups, rollback and updated agent surfaces |
| Launch privacy claim | No ordinary content processing in accepted private path | Full egress/adversarial sweep, independently reviewed client/worker release controls and final scope disclosure |

No new live inference or Phala restart is authorized by a successful local test.
The existing cost ceilings remain binding. Local build/testing continues while
the dedicated guest is stopped. Public deployment/Git push remain prohibited.

## Implementation rules

1. Keep tested HPKE, attestation, capability authorization, encrypted worker objects, execution journal, budget and receipt primitives. Do not rewrite working security code for naming consistency.
2. Add ciphertext contracts without making legacy plaintext rows look encrypted. Every route, tool and worker must enforce the persisted classification and owner; no plaintext fallback.
3. The user owns durable random keys. Wallet login grants access to ciphertext, not decryption. Do not derive the new vault from public wallet addresses or login signatures.
4. A completed phase requires observable acceptance evidence. A unit test is not browser E2E, real Postgres, model-quality evaluation or hardware attestation.
5. Public network services see submitted arguments. One UI does not remove those disclosures. Keep private-context egress blocked until exact policy and user disclosure are implemented.
6. Existing private recovery material must stay decryptable until an explicit, tested migration. Do not prune sole keys, bulk-delete data, rotate credentials or reset state for hygiene.

## Phase 0 Repository hygiene

**State: completed in this local change.**

- Consolidate current docs in `dr-nib/privacy/`; archive dated decisions and the superseded migration map.
- Correct misleading public docs about plaintext intake, fallback, receipt verification, keys and completed research parity.
- Remove the unmounted standalone `PrivateResearch` demo UI and unused generic `on-demand` lifecycle prototype; retain the newer broker-wired Phala wake controller and tests.
- Preserve experimental libraries with explicit ownership/status rather than scattering deployment instructions or moving active runtime imports.
- Record removed test coverage in status: removing eleven tests for the deleted prototype is not eleven lost checks on the retained controller.

## Phase 1 Vault cryptography

**State: core and owner rehearsal integration implemented locally; no production cutover.**

`frontend/src/lib/dr-nib-private-vault.ts` creates a random non-extractable AES vault key, a recovery envelope, and independent random report-seed/worker-state material per project. Project keys are authenticated-encrypted under the vault key. Recovery uses a separately held generated random secret. Envelopes bind tenant, vault, project, purpose and version.

Acceptance: recover the vault and project material from serialized ciphertext in a new key context; reject tampering, wrong keys, tenants, projects, purposes, formats and versions; never accept identity alone as recovery. Verify TypeScript and browser WebCrypto behavior. No custom crypto algorithms or backend-held recovery key.

**Verified:** seven Node contract tests, seven browser crypto checks, targeted and full frontend TypeScript checks.

**Remaining:** independent envelope/security review and optional passkey PRF/device pairing. Enrollment, generated recovery code, IndexedDB persistence and HPKE action integration now exist in the owner rehearsal; no recovery secret is an ordinary API field.

## Phase 2 Durable vault and device enrollment

**State: owner-scoped implementation and local persistence/recovery checks complete; optional passkeys/device pairing and legacy import remain open.**

- Replace the capped prototype IndexedDB cache with a transactional enrolled-vault store. Await commits before accepting an upload; storage failure cannot silently create a replacement key. Enforce create-once project key enrollment and reuse on retry; calling the random-key primitive twice must not overwrite an already-encrypted project.
- Add owner-authenticated ciphertext vault/key-bundle synchronization with schema, size, revision and optimistic concurrency checks. Tenant comes from authenticated identity. Ordinary backend never receives unwrapped material.
- Keep device-local unlock convenient. Add WebAuthn PRF wrapping only after supported authenticator/browser behavior is verified; authentication-only passkeys are insufficient. Provide trusted-device transfer and a generated recovery secret alternative.
- Store encrypted project manifest, titles and questions. Differentiate locked, unsupported, missing and corrupt states.
- Retain old wallet-derived and local keys for an explicit import/rewrap migration. A login or browser reset must not overwrite old ciphertext.

Acceptance: refresh/browser restart without data loss; second-device unlock from recovery; wrong account/key rejection; aborted IndexedDB transaction; unsupported PRF; offline enrollment; lost-device flow; concurrent changes; account/wallet changes; no secret in API/logs. Document limits on replay of old valid ciphertext and device revocation: revocation cannot erase already copied keys.

## Phase 3 Durable encrypted uploads

**State: implemented in the owner preview; real browser upload and ciphertext-canary storage audits passed. Broad file-type/adversarial and recovery acceptance remains open.**

- Reuse HPKE for key delivery to a verified guest and the existing context bindings. Keep ephemeral guest transport keys separate from durable project keys so stored uploads survive guest restarts.
- Encrypt raw files and filenames before ordinary API ingress. Use project-key encryption for durable originals; store only ciphertext in private R2 and encrypted source manifests in Postgres.
- Authenticate upload/list/download/remove and enforce bounds, revision/idempotency and tenant/run ownership. Complete interrupted uploads safely and clean orphan ciphertext without deleting a prior good object.
- Parse and OCR only inside verified processing, including extracted previews. Reopen and remove sources through the existing SourceManager appearance; do not parse on Railway.
- Replace the fail-closed older encrypted-source seam deliberately; do not toggle its stub to return true. Preserve existing routes until their consumers are migrated and docs updated.

Acceptance: browser file -> captured ciphertext HTTP -> local storage -> separate local worker decrypt -> matching original; plaintext canaries absent from object/DB/queue/log bytes; wrong owner/key, tamper, replay, stale revision, failed upload, reload and each supported file type. Local fixture identity must never be accepted by production verification.

## Phase 4 Private intake and worker stages

**State: real intake, answers, plan, uploaded-source plus approved-web report and discussion passed on the reviewed guest. This is the shared report pipeline, not complete adaptive-agent parity.**

- Keep the existing question/intake/configure/review/run/report screens. Move question, answers, guidance and discussion onto encrypted contracts; do not create an ordinary topic-bearing run as a prerequisite.
- Extract reusable stage logic from `worker.js` behind private store/events/AI/judge/tool ports. Reuse protected plan/write primitives and real prompts; avoid another standalone research engine.
- Move source scoring, follow-up planning, verification and content-based decisions inside approved confidential inference. Preserve explicit uncertainty and hard budget/depth rules. Evaluate decision quality before replacing JEV behavior; never quietly call ordinary hub JEV with private context.
- Encrypt steps, claims, decisions, citations, event content, errors and future embeddings. Keep only fixed coordination fields public. No shared lessons/disk-memory fallback.

Acceptance: complete source-only research at representative sizes; planning approval, pause/resume/end and discussion; no private input to ordinary LLM/JEV/SSE routes; full source coverage including late pages; crash/retry without duplicate paid work; public/synthetic paired report and decision-quality evaluation. The legacy 512-token demo cap is separate from the current stage limits (4,096 intake, 8,192 plan/verification, 16,384 writing). A completed owner report does not establish quality parity across topics and sizes.

## Phase 5 Confidential inference compatibility

- Preserve gateway identity pinning, session discovery, channel binding, attested-upstream and ZDR requirements, receipt signature/request/response/model/session binding. Audit SDK behavior against the exact pinned version.
- The real approved gateway catalog/session API and signed completions have been verified. The port commits up to sixteen valid same-model sessions and requires the receipt's actual serving session to be a member of that exact set. Reverify API/SDK changes instead of relaxing identity checks.
- Enforce required verification facts directly, including the receipt's upstream-required condition; no ordinary provider fallback or permissive retry.
- Choose the model through synthetic quality/cost evaluation. The locally configured Qwen route is a prototype, not an established replacement for the ordinary engine.

Acceptance: fixture integration for both successful and rejected channel/receipt cases; malformed/downgraded routing blocked before content release; no replay of uncertain inference. Live Phala verification and paid quality checks are authorized within the recorded limits; full report quality and migration acceptance still need real evidence.

## Phase 6 Tools and external data

**State: bounded explicit-query Wikipedia/OpenAlex/Crossref retrieval and manual Hub source-tip wiring are implemented. Full provider relevance/scoring, paid sources and isolated arbitrary compute remain open.**

- Classify every current tool and retrieval provider: local/private operation, external read, external write or financial action. Migrate compute/evidence first.
- Put untrusted code in an isolated runtime with no network, credentials, dstack socket or unrelated storage. The model cannot grant itself capabilities or expand allowlists.
- Execute protected tools within the confidential boundary. Enforce network permissions outside the reasoning loop; validate DNS/IP, redirects, URLs, headers, bodies and methods.
- Retain web research in the same UI. An isolated public-retrieval component may use only client-approved public input, never private document state. If private-context queries are needed, require a clear disclosure bound to exact outgoing arguments and destination. ZDR/filtering cannot promise provider blindness.
- Handle hostile pages, remote images, markdown/HTML and injected follow-up URLs as exfiltration vectors. External MCP services are separate recipients.

Acceptance: map and test every existing tool, including direct/academic/free retrieval and ordinary sandbox paths; prove private text cannot enter public retrieval; malicious file/page requests for exfiltration are blocked; unknown tools and parameter substitutions fail closed. Any capability not migrated remains unavailable on confidential runs and blocks a claim of full functional parity.

## Phase 7 Scheduling accounting and persistent execution

- Integrate opaque-ID jobs, encrypted checkpoints, leases and per-stage idempotency into the real queue/recovery sweep. Preserve protected owner/classification checks during terminal-state races.
- Budget reservations precede inference. Reconcile only verified usage; uncertain calls remain reserved. Replace best-effort broker metering with a durable idempotent outbox/reconciliation flow before promising full accounting parity.
- Keep escrow, wallet keys and signing outside content/model context. Define permitted public payment metadata and ensure reports remain recoverable independent of settlement.
- Finish admitted work while keys remain in guest memory. After a cold restart, park until a verified client releases keys again. Unattended restart-independent recovery requires a separately reviewed, independently governed release service; do not fake seamlessness with an operator master key.

Acceptance: app/tab closure, broker crash, guest restart, lost response, duplicate queue delivery, concurrent runs, cap/pause/end/refund reconciliation, shutdown uncertainty and cost controls. Cold-restart behavior must meet the release UX contract before default cutover.

## Phase 8 Reports exports and history

**State: a real report, persisted discussion and all seven actual browser downloads passed. Physical second-device and adversarial synchronization acceptance remains open.**

- Use existing project/run/report screens to decrypt encrypted manifests, report versions, citations and private progress. No remote content auto-fetch from rendered private output.
- Render exports on the client where feasible; otherwise inside verified worker processing with encrypted delivery/persistence. Cover all seven current formats.
- Support report discussion through protected inference, encrypted history across devices, and explicit key-sharing for any future shared report. Sharing authorization must not rely on a public URL alone.
- Define retention/deletion across live rows, R2 versions, backups, devices and exported copies. Never claim retroactive deletion of data already downloaded.

Acceptance: reopen on another enrolled device without new inference; version/citation consistency; seven export formats; follow-up conversation; failed synchronization without data/key loss; keys/content absent from ordinary previews, exports and observability.

## Phase 9 Release boundary and cutover

- Produce reviewed digest-pinned worker/client artifacts and an independently approved key-release policy. Verify complete hardware/OS/event-log/KMS/network chain, disabled SSH/debug and logging, and inference boundaries. Mutable website delivery remains a release issue, not something encryption alone solves.
- Keep development fixtures impossible to enable in production. Separate local software E2E evidence from actual remote attestation evidence.
- Rehearse the additive database/data migration locally. Old plaintext records remain explicitly legacy until an owner-authorized encryption migration; backups may still contain historic plaintext. Never delete the legacy worker/data readers until migration and rollback/compatibility needs are covered.
- Update affected API, MCP, discovery, SDK and llms surfaces in the same behavior-changing work. Hub OpenAPI/MCP/registry versions move together when applicable; Dr. Nib's own version is separate.
- Only after explicit deployment authorization, verify live agent surfaces and complete a live synthetic flow. Until then describe this as a local migration in progress.

Acceptance: familiar full product journey on two devices; adversarial leakage sweep over HTTP/DB/R2/Redis/queues/logs/telemetry; paired quality and cost evidence; no unreviewed egress or plaintext fallbacks; reviewed recovery/update controls; independent security review before a strong operator-blind claim.

## JEV requirement confirmed 18 October

The owner requires the actual TypeSafe JEV decision model. A generative model
prompted to emit JSON is not an authorized substitute. The current JEV transport
is OpenRouter's Decisions API (`jev/src/decisions.ts`), through Hub routes. The
Phala completion port currently supports verified chat inference, not a verified
JEV System One serving route. The owner subsequently authorized hosted JEV through a verified ZDR route; this now runs directly from the guest. Do not send research state through ordinary Hub JEV.

TypeSafe's public enterprise page offers zero retention by arrangement, but a
remote-attested private JEV deployment has not been confirmed. A provider-hosted
or vendor-authorized JEV container in a TEE is the preferred route if available.
A minimized external JEV feature vector would disclose derived metadata and
change which model performs semantic assessment; it needs explicit owner
approval and quality evaluation and is not the strict-private default.

The concrete vendor question is whether actual JEV can be served with its native
Choice/Score/Noul contract behind attested CPU/GPU inference, with endpoint/key
binding, a pinned model/build, prompt-free logs and request/response integrity,
either as a vendor service or an authorized encrypted-weight deployment on Phala.
The public Phala catalog lists Kev 4B but no JEV entry; that is not evidence of
equivalent decision quality or a native private JEV route. Do not switch models
without authorization and a representative evaluation.

Public references: [TypeSafe enterprise](https://typesafe.ai/enterprise),
[TypeSafe primitives](https://docs.typesafe.ai/introduction),
[OpenRouter JEV API](https://openrouter.ai/blog/tutorials/how-to-use-jev/).
No vendor contact was sent. Synthetic research judgment context was sent through the disclosed hosted route during the approved owner test.

## Original pipeline parity map

| Capability | Established ordinary implementation | Current confidential implementation / next work |
|---|---|---|
| Intake, thinking summaries, plan, report | `llm/generate.js`, `jev/intake.js`, `worker.js` | Shared generators reused; local candidate adds actual native JEV intake gating and shared short-report generation; new live acceptance pending |
| Source trust/quality and branch decisions | `jev/decisions.js`, `jev/client.js` | Actual hosted JEV ZDR source/branch decisions passed; provider-visible rather than attested |
| Adaptive rounds and follow-up questions | `worker.js` stage handlers and `agent/loop.js` | Bounded actual propose → JEV judge → execute passed; local skipped-tool termination fixes tested; broader rounds/checkpoint parity remains |
| Visible activity and decision evidence | `eventlog.js`, `events.js`, run activity UI | Encrypted live snapshots and actual JEV decisions passed; broader crash/lost-response UX remains |
| Compute and tools | `tools/executor.js`, `tools/sandbox.js` | Local bounded evidence/arithmetic, subtraction and writer result context implemented/tested; isolated arbitrary code and paid sources remain |
| Escrow deposit/draw/split/refund | `escrow/jobs.js`, `escrow/settle.js`, `money.js` | Separate local funding service and restricted DB role passed a real 0.25 test-USDC owner deposit and confirmed 0.242652 refund. Further failure/recovery cases remain. Wallet/amount/opaque IDs stay outside document context |
| Reports, follow-up and seven formats | `exports/render.js`, report UI | Real owner flow passed; broader recovery, versioning and quality evaluation remain |
| Memory and crash recovery | `memory.js`, `agent/lessons.js`, worker leases | Shared plaintext memory prohibited; encrypted per-owner checkpoints/reconciliation remain |

## Next work in order

1. Finish and verify the local reasoning/activity and known-failure settlement
   candidate; build a source-matching local image without starting paid services.
2. Implement checkpointed stage/action recovery and safe steering. An uncertain
   model call cannot be repeated or billed as finalized usage to make the UI move.
3. Restore remaining original research/tool behavior within explicit recipient,
   sandbox and spending boundaries, then evaluate paired quality and cost.
4. Complete physical second-device recovery, Google/wallet regression and
   adversarial privacy tests.
5. Review/pin the resulting client and worker artifacts, run final live E2E
   under an approved spending window, and only then propose a public cutover.

Keep actual JEV and disclose that TypeSafe/OpenRouter see selected judgment
context through the configured ZDR route. This architecture protects private
content from the ordinary Nibgate backend; it is not provider-blind JEV.
