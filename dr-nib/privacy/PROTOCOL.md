# Local private workflow protocol

## Authenticated public admission

`DRNIB_PRIVATE_ACCESS_MODE=authenticated` is an explicit deployment policy on broker, guest, funding and watchdog. The default remains the earlier owner rehearsal. Public admission retains authenticated sessions, signed capabilities and persisted per-project ownership; it does not share vault keys. The legacy test-tenant setting supplies the infrastructure control identity. Preflight resolves each actual project owner from the database. AI admission remains globally serialized across all accounts, and lifecycle draining checks all confidential processing leases in the scoped database. Background settlement scans confidential terminal runs and acts as each persisted owner. Changing an existing lifecycle access policy requires an explicit stopped-state migration without resetting runtime or spending counters.


This contract is an **owner-scoped rehearsal**, disabled by default. It is not a production cutover or evidence of hardware confidentiality. The funded owner-scoped flow has passed real Phala E2Es; later production lifecycle proposals remain separate. The owner-authorized real rehearsal has updated the dedicated Phala guest and private test database; isolated unit tests do not change them.

## Browser → ordinary broker

The same-origin browser prefix `/drnib-private-api` proxies to the isolated broker. Routes below are relative to `/v1/private`. Every data route authenticates the existing session and restricts the configured test tenant. The anonymous capabilities response contains only availability flags. Mutation requests require JSON; cross-site browser mutations are rejected. Authorization is repeated against the persisted project owner and confidential classification. Responses are not cacheable.

| Method and path | Contract |
| --- | --- |
| GET `/capabilities` | Anonymous rehearsal availability flags; no owner identifiers or secret content. Funded mode is separately configured and gated. Record readiness is separate from workflow action readiness. Public retrieval is advertised only when the explicit broker web gate, records and actions are enabled together; pausing workflow preserves access to encrypted saved records. |
| GET `/identity` | Authenticated tenant identifier, never a content key. |
| GET `/vault` | Vault ID, revision and encrypted recovery/optional passkey records. |
| PUT `/vault` | Create once at expected revision zero; passkey-only updates use compare-and-swap and must preserve the recovery envelope. Master-key changes require the atomic replacement route. Recovery codes and unwrapped keys are never request fields. |
| GET `/vault/recovery-snapshot` | Owner-only encrypted project-key wrappers and digests, including trash, plus the current vault generation. No content or plaintext keys. |
| POST `/vault/replace-recovery` | Explicit enrolled-device replacement: expected vault generation, new recovery ciphertext, and a complete set of replacement project wrappers with old digests. One transaction changes all wrappers and the recovery record; incomplete/stale sets fail. Invalidates optional old passkey recovery. |
| POST `/projects` | Atomically create an opaque confidential run, wrapped project keys and encrypted manifest using `expectedVaultRevision`. Creation and recovery replacement share an owner lock; stale-generation requests fail before writing a run. Wrappers remain immutable outside the dedicated atomic recovery-replacement route. |
| GET `/projects?deleted=1` | Opaque IDs, dates and generic lifecycle status. The browser decrypts titles from manifests for active projects. |
| DELETE `/projects/:runId` | Soft-delete an idle project. Unresolved actions prevent deletion. |
| POST `/projects/:runId/restore` | Restore soft-deleted ciphertext. |
| GET `/runs/:runId/objects` | Object descriptors: opaque IDs, kind, vault ID and revision. |
| GET `/runs/:runId/objects/:objectId` | Owner-authorized ciphertext envelope with an integrity digest check. No plaintext URL or public bucket URL. |
| PUT `/runs/:runId/objects/:objectId` | Context-bound AES-GCM envelope, kind, vault ID and expected revision. Source count/size, immutable keys and source edit locks are enforced. |
| DELETE `/runs/:runId/objects/:objectId` | Remove a source from future research while idle; no permanent purge is claimed. |
| GET `/runs/:runId/actions` | Latest processing/uncertain action for the owner, or idle. Processing may include a bounded encrypted progress snapshot. No guest wake or inference. |
| GET `/runs/:runId/actions/:requestId` | Durable status, processing progress, or completed/uncertain encrypted reply. This does not wake a guest or issue model calls. |
| POST `/runs/:runId/wake` | Owner-authenticated empty JSON body only; explicit wake returns ready or 202 starting. Paused workflow cannot wake compute. No source content, key or AI action is accepted. |
| GET `/runs/:runId/wake` | Owner-authenticated lifecycle phase only; never wakes compute or extends idle time. |
| POST `/sessions` | Fresh nonce-bound guest recipient evidence for an owned confidential run. |
| POST `/sessions/:sessionId/prove` | HPKE challenge proves possession of the evidenced guest private key. |
| POST `/sessions/:sessionId/action` | Run ID plus one HPKE envelope; action name, arguments and state key are inside ciphertext. Requires the additional `sessions:action` capability and explicit workflow readiness. |

These are Dr. Nib broker endpoints, not new Hub endpoints or public MCP tools. Hub OpenAPI/MCP/registry versions and fee behavior are unchanged. Public agent discovery must not advertise this rehearsal as available production research.

The isolated owner-authorized money service's existing GET
`/v1/private/runs/:runId/escrow` adds `expenseReceipt` with format
`drnib-expense-receipt-v1`: financial line items and decimal USD string totals.
It contains model identity, priced tokens and charge status, never prompts,
outputs, filenames or raw provider evidence. Ledger spend references determine
charges; finalized usage alone is not a debit. Infrastructure remains explicitly
operator-funded/unmetered. Unknown calls are not customer invoices. JSON report
exports include the same authoritative receipt through the measured worker;
browser state/model output cannot supply financial totals.

## Checkpointed control and recovery (local candidate)

Migration 0012 adds per-action worker leases. The worker owns an encrypted
`checkpoint` object; clients may read its ciphertext but cannot replace it.
Completed parser, inference, JEV and public retrieval results are journaled
before the next operation. Digests use a project-key HMAC, not public hashes of
private prompts. Recovery restores priced response evidence without dispatching
completed work again. A started operation without a durable result is uncertain
and cannot be replayed directly. For an expired processing lease, the attested
worker can replace only a final unfinished `infer` operation after moving its
full unknown charge to an operator reservation. This is bounded to two
replacements per journal; completed entries remain cached and terminal, JEV,
public-tool and payment operations are excluded. The held amount still counts
against the global AI cap and is never called a verified zero charge.

During processing the owner appends a new `intent` object at expected revision
zero, encrypted for purpose `intent`, with format `drnib-control-v1`, the
`targetRequestId`, and command `pause` or `guidance` (with bounded `text`). Intent
records cannot be overwritten. Only active/paused research accepts commands.
The measured worker consumes each command once at a new operation boundary.
Guidance accumulates up to 8,000 characters and affects future calls only; it
does not rewrite a cached request. Pause acknowledgment means queued, not that
an in-flight remote operation has stopped. The paused manifest identifies its
checkpoint root, and resume replays completed results before new work.

Action status may include `recoveryAvailable: true` when the 90-second worker
lease has expired. This advertises eligibility to attempt recovery, not proof
that every operation can be retried. The client verifies a fresh guest session
and sends encrypted `recover` using the **original request ID** and project key.
The worker atomically rechecks the latest authenticated journal, unchanged
manifest and absence of unresolved model reservations under the run lock before
taking the lease. Old workers are fenced from progress, operation admission and
final commits. A NULL legacy lease cannot be taken over. Cold restart still
requires owner key release; there is no operator master key. These controls
have local synthetic HTTP/Postgres coverage. Completed-call recovery and boundary pause/restart/resume have also passed live; sudden unresolved-call crash reconciliation remains a launch gate.

## Active research duration

Encrypted manifests, action progress and failure receipts may include
`activeWork: {format:"drnib-active-work-v1", durationMs, observedAt, running}`.
The worker uses a monotonic timer; the clock cannot be derived from project age
or wall-clock creation/completion dates. Research checkpoint saves and 30-second
heartbeats serialize timing saves with operation saves under the existing lease.
Restore uses only the recorded total, never elapsed time between worker sessions.
Owner-question and user-pause commits freeze the clock; completion/failure freezes
it too. This measures funded research work, not intake preparation, exports,
subsequent discussion, provider invoices, or a customer compute charge.

The browser reads timing only from authenticated decrypted snapshots, advances a
live observation by at most 30 seconds and freezes for stopped/recovery states.
A legacy run without timing starts recording at its next research action; prior
history is not guessed. Timing is private ciphertext, not a new broker metadata
field, public endpoint or billable pricing change.

## Key and object formats

`drnib-private-vault-v1` authenticates tenant, vault, project, purpose and revision. New project creation also supplies `expectedVaultRevision`; the owner advisory lock serializes creation with recovery replacement, rejecting stale tabs before any project is created. A random client vault wraps independent random worker-state and report-seed material for each project. The enrolled local vault uses a non-extractable WebCrypto key in IndexedDB; transactions resolve after commit. There is no capped-key pruning or identity-only recovery. New vaults require a strong user-chosen password and a separately saved random backup code. Both wrap the same random vault key in a version-2 recovery record; password wrapping uses a unique salt and PBKDF2-HMAC-SHA-256 with 600,000 iterations in the browser. Version-1 code-only records remain readable. The server holds only ciphertext and KDF parameters. An unlocked version-2 vault can optionally enroll a WebAuthn PRF recovery passkey: Help verifies its password, creates a credential and requires a successful assertion before saving a separately encrypted vault-key wrapper, credential ID and salt. The PRF output stays in the browser; unsupported authenticators do not enroll. A new browser needs the same available credential plus account sign-in. Recovery replacement clears the old passkey wrapper. No wallet-signature-derived key, operator escrow or automatic device pairing exists.

Roll out in order: deploy version-2-aware private brokers first with `DRNIB_REQUIRE_PRIVATE_PASSWORD` unset, verify existing version-1 reads and version-2 validation, then deploy both browser frontends and recovery docs. After the new frontends are live, set `DRNIB_REQUIRE_PRIVATE_PASSWORD=true` on both brokers to reject new version-1 enrollments; existing version-1 vaults and code unlocks continue working. Do not enable the requirement before the frontend deploy or rotate existing vaults automatically.

An enrolled browser can explicitly replace a lost password and backup code from Help. It generates a new non-extractable wrapping key with the same vault ID, decrypts and rewraps all project seeds locally, including deleted projects, and keeps document/report/checkpoint encryption unchanged. The user sets a strong password and confirms a fresh random backup code before dispatch. The server validates a complete old-digest snapshot and commits all wrappers in one parameterized PostgreSQL JSON batch plus the vault-generation increment atomically. A bounded 20-second transaction preserves all-or-nothing semantics across larger project sets. Transport/database failures return 503 so a browser retains its pending key until reconciliation; only actual snapshot conflicts return 409. Project envelope context/revision remains 1 because the wrapped project material is unchanged; only this dedicated atomic route may replace wrappers. The old password and code cannot unlock the new recovery record. This does not revoke previously copied content or keys on an old device.

Before dispatch, IndexedDB durably stages the replacement CryptoKey alongside the still usable old enrollment. A lost response is reconciled against the exact staged recovery envelope and generation before promotion. Promotion and removal of obsolete cached project wrappers share one IndexedDB transaction; server-held encrypted content is not deleted. Unconfirmed outcomes retain both enrolled keys. A different device observing a new recovery envelope must enter the new code, rather than trusting a changed wrapper with its previous key. Loss of all enrolled devices and the saved code remains unrecoverable; no wallet-identity bypass or operator key escrow exists.

`drnib-client-object-v1` uses AES-256-GCM with a random 96-bit IV. HKDF-SHA256 derives a purpose key from the project worker-state key; tenant/vault/project form the salt. AAD binds tenant, vault, project, object, monotonic revision and purpose. Manifest, source, intent, discussion, export, report and event are distinct purposes. Node guest and browser WebCrypto interoperation is tested. JSONB object order cannot change the canonical ciphertext digest.

Source JSON includes the filename, byte count and base64 original **inside encryption**. Encrypted source envelopes go to the private ciphertext bucket under random opaque paths. Wrapped project keys and encrypted manifests/receipts go to Postgres. The manifest contains topic, intake, plan, evidence references, sampled claim judgments with exact quoted passages checked against supplied evidence, report versions, events and discussion. Export bytes are generated inside the guest and returned as an encrypted action reply; exporting again does not repeat research.

## Guest action transaction

Exports read their financial receipt from the authoritative owner-scoped ledger
inside the guest: deposit, finalized spend, operator-side fee, confirmed refund
and stored transaction references. Browser arguments and model output cannot
supply these amounts. After cancellation, completed encrypted receipts remain
readable and existing reports can be exported without inference. An unfinished
paid action stays fenced; exporting does not reopen its budget.

The client checks independent evidence and live key possession before releasing an HPKE command. The one-use command contains session ID, request ID, vault ID, action, arguments and project state key. The guest authenticates the key by opening the manifest before claiming the action.

A keyed semantic request digest and one active action per run prevent automatic paid replay. Claiming locks and rechecks the manifest revision. Source/manifest edits and deletion cannot race an active or uncertain action. The final encrypted manifest, generic lifecycle status and encrypted receipt commit atomically. A repeated completed request returns its existing encrypted reply. A failed/unknown operation remains uncertain, so retries cannot silently duplicate paid work. Authenticated checkpoints restore completed stages. The bounded interrupted-inference recovery described above can progress without resolving the provider bill; it preserves the full operator exposure rather than fabricating a charge or releasing a hold. Unknown tool/payment outcomes still require reconciliation.

An uncertain receipt may also carry an encrypted failure envelope bound to the
same project and request. The guest restricts its contents to fixed error codes;
it never serializes exception messages or provider responses. Only the client
decrypts the diagnostic. Missing diagnostics leave the action uncertain, and
neither viewing a diagnostic nor reconnecting authorizes a paid replay.

While processing, the receipt's reply column may instead contain a bounded
512-KiB activity snapshot with at most 512 new events. The guest writes it under
the run lock, checks ownership and processing status, and advances its revision
up to 256. AES-GCM/HKDF purpose `action-progress` separates it from the final
`event` reply, preventing result/progress substitution. The final atomic commit
replaces progress with the completed reply. Late progress writes fail. The
browser overlays decrypted activity only on read-only views; manifest mutations
read the committed state. An older broker returning 404 for the activity route
continues to support saved manifests. Snapshots contain fixed stage descriptions plus bounded actual native JEV decisions when the measured hosted route is enabled. Fixed descriptions are not model reasoning. The owner-tested release includes live encrypted progress; the final manifest retains the full decision records.

Each inference reserves durable worst-case spend before dispatch. The old and new paths use the same monthly admission lock and combine committed/reserved totals. Unknown spend remains reserved. Cryptographically verified inference receipts bind request, response, serving session and required confidential upstream verification. The local funded candidate also enforces the decrypted per-run budget and chain-confirmed customer deposit. Hosted JEV usage remains provider-reported. Historical unknown outcomes are not released by enabling funding.

## Separate public-money service: local funded candidate

The explicit `NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED=true` build uses the separate
same-origin `/drnib-private-funding-api` prefix. It must resolve to a configured
funding service, never fall back to the ordinary research API. Routes are relative
to `/v1/private`, require the existing authenticated owner, and accept only closed
public-money payloads:

| Method and path | Contract |
| --- | --- |
| GET `/runs/:runId/escrow` | Public escrow status and accounting metadata. |
| POST `/runs/:runId/escrow` | Prepare existing wallet deposit parameters; no transaction signing. |
| POST `/runs/:runId/escrow/register` | `{jobId}`; independently verify the on-chain owner, token, evaluator, splitter and deposited amount before recording funding. |
| POST `/runs/:runId/escrow/complete` | `{}`; freeze customer usage and settle through existing testnet keeper rails; return pending while outcomes cannot be established. |

The on-chain description contains an opaque run UUID, not the research title.
The service holds the keeper credential and a restricted database role; the
document worker holds neither. Funding records and payment metadata are public
money boundaries, not encrypted research. Customer inference is tagged separately
from sponsored intake/planning/discussion. Only accounted customer usage enters
settlement; active/uncertain actions or unresolved customer reservations prevent
settlement. Frozen amounts and transaction references are reused on retry;
ledger debits are deduplicated and refunds await confirmed chain execution.
Encrypted state/source replacement is locked after escrow registration.

Known local failures without outstanding model reservations may finish as
`failed` with an authenticated encrypted `outcome: failed`; ordinary broker status
alone cannot authorize a new paid action. Unknown outcomes remain `uncertain`.
The new dispatch candidate records `not-dispatched` with zero committed spend
only when the measured AI port's local control flow proves that its serialized
completion request was never invoked. Provider strings and HTTP error responses
cannot supply that proof. Completion/receipt failures retain their reservations;
existing unknown rows are unchanged. Zero-dispatch attempts remain auditable and
are excluded from customer settlement debits.
Actual wallet-funded browser and chain settlement acceptance remains pending;
simulated-chain financial tests do not satisfy that release gate.

The bounded workflow uses closed stage profiles: intake requests
`reasoning_effort: "none"`, planning/writing/sampled verification now request `low`,
and discussion requests `low`. Planning/writing temperatures follow the ordinary
generation pipeline. Planning and verification allow 8,192 output tokens;
writing requests 16,384 total output tokens, with that headroom reserved before
dispatch. Intake, planning and
sampled verification also request `response_format: {type: "json_object"}`.
These parameters are included in the receipt-bound request digest. A real public-only probe returned 8,199 completion tokens for a request capped at 512 with high reasoning. The current meter rejects this discrepancy and keeps its reservation; the accounting ceiling was not relaxed. An explicit reasoning-token object was rejected by the route; a later `low`-effort public probe returned 39 total completion tokens within its 2,048-token limit, with a valid signed receipt and 120 micro-USD verified cost. That profile is selected in the reviewed worker. One real report passed sampled source checks; broad quality parity remains unverified. The live
Phala catalog advertised them for the configured Qwen model during the rehearsal.
The settings do not establish model quality or complete ordinary-agent parity.
JSON mode does not replace application schema validation.
Truncated completions are rejected, with encrypted diagnostics and no automatic
paid replay. See [Phala's completion API](https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/api-reference/chat-completions)
and [structured output](https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/structured-output).

The measured worker reuses the ordinary `llm/generate.js` functions for intake
cleanup, answer acknowledgments, planning and full report assembly (introduction,
sections, conclusion, abstract and references). An action-scoped provider port
intercepts every model call before ordinary router/configuration/fetch handling.
Expired private scopes reject rather than falling through to ordinary inference.
Report assembly rejects fallback sections. Calls within an action are serialized;
an unknown inference outcome latches the port closed and its durable reservation
blocks further calls in that action. Completed authorizations are not cached:
the broker only coalesces simultaneous Hub checks for the same session.

This reuses generation behavior, not the complete ordinary adaptive research
engine or its model router. Model-quality parity and adaptive decision migration
remain separate acceptance requirements.

## Tool and rendering policy

There is no arbitrary HTTP, MCP, code execution, payment, creator rating, ordinary JEV or ordinary agent-memory port in protected orchestration. Bounded evidence search and arithmetic have explicit local implementations. The new guest wiring supplies a public retrieval adapter that accepts only an explicit `{approved: true, brief}` approval; the approved brief is at most 400 characters and is shown in the browser. The adapter has no project keys, uploaded files or chat history. Wikipedia, OpenAlex and Crossref searches run in parallel; at most six deduplicated sources and four page extractions fit a shared fifteen-second deadline. HTTP is GET-only with fixed public headers and the existing DNS/public-IP/redirect/response-size guard. Extracted text is bounded, and search excerpts are marked as excerpts in model evidence. Queries and requested URLs are visible to these external services; enclave execution does not conceal them. Search failure has a fixed encrypted diagnostic and does not fall back to ordinary inference. This implementation is present in the reviewed source-validation image; the dedicated guest is stopped after its completed bounded test.

Historical source-card prototype: optional source tipping stayed in the existing browser wallet/Hub flow. The current owner-approved worker tool candidate is specified below. Only a public-web source can open the card. Opening it resolves the selected public URL through the existing `/hub/resolve` endpoint; the shared wallet SDK performs existing direct/held tip verification. No request occurs just from rendering a source. No project ID, source filename, report or vault data is supplied to the payment SDK. The user must approve the payment in their wallet; the worker has no signing key and cannot tip autonomously. Confirmed tip notes are encrypted back into the manifest; a note-sync failure never retries the payment. No new Hub route, fee behavior or private-worker payment endpoint is introduced. Real money movement was not tested or authorized for this rehearsal.

Untrusted code still needs a genuine isolation boundary; `node:vm` is not used as a security sandbox.

Private report markdown omits external images. User-selected downloads decrypt in the browser. Private builds intercept unknown ordinary API requests and reject them. Legacy builds and old plaintext records are not silently relabeled or migrated. Independently approved client/release delivery, cryptographic rollback resistance beyond ordinary database CAS, egress enforcement and a full adaptive private research engine remain release work.

## Report failure diagnostics

The private generation bridge preserves the first allowlisted AI failure when
the shared report assembler rejects incomplete sections. AI errors expose only
a fixed request-policy, gateway-attestation, serving-session, completion, or
receipt-verification category inside the encrypted action receipt. Completion
HTTP errors additionally distinguish fixed request-rejected, credential-rejected,
rate-limited and unavailable-upstream categories without reading provider bodies. They never
include exception text, provider bodies, prompts or source content. An unknown
paid call remains reserved and closes further dispatch in the action. A failed
project is not silently reset or replayed; separate test attempts retain their
own durable actions and the shared spending cap.

Local follow-up: attestation/PCCS requests are bounded to thirty seconds and
completion requests to three minutes. A timeout still fails closed; it does not
authorize provider fallback, release an unknown reservation or replay inference.
These timeout updates are included in the reviewed source-validation release.


Serving-session discovery now uses the same SDK-verified gateway transport as
completion requests. The model catalog and live session registry are fetched
through that channel, avoiding a separate ordinary-HTTPS discovery connection
that may land on another gateway replica. Model approval, production OS/compose
pins, mandatory ACI/ZDR and exact signed-receipt/session checks remain required.
A real read-only preflight verified both catalog and session GETs over this
channel with no inference or cost reservation. The final browser flow subsequently passed intake, upload, approved web retrieval, report validation, discussion and seven exports.


Final sampled report checks now request at most eight claims, numeric
`citationIndex` references and literal contiguous quotations. Unknown claims
must not invent supporting quotes. The validator retains exact quotation checks,
rejects unsupported judgments and requires at least one supported sampled claim;
a wholly unknown check cannot approve the report. Schema, source-index,
quote-mismatch and insufficient-evidence failures have distinct fixed encrypted
codes. A prior real run reached web retrieval and all report-writing model calls
but failed the earlier combined validation check; no report was committed and
that failed action was not reset or replayed. The later run recorded in STATUS.md completed after one metered correction.

The final reviewed session-rotation fix discovers at most sixteen valid, deduplicated
session IDs for the approved canonical model through that verified channel. Each
completion commits this exact allowed set in `aci_session_ids`; the verified
receipt must identify an actual serving session in that set. An unlisted session
fails closed. The following recovery behavior is implemented in the local candidate and
awaits live release acceptance. HTTP 412 retains the internal encrypted `PHALA_PRIVATE_AI_SESSION_EXPIRED`
category for compatibility; the UI describes rejection of pinned verified
sessions, since HTTP status alone does not establish expiry. Discovery ignores
expired/missing-expiry sessions, requires five seconds of remaining validity,
and uses uncached discovery through the same attested transport.

The adapter preserves safe failure metadata (HTTP status, exact request digest,
model and any receipt ID), never provider error text. A 412 permits one fresh
verified connection/session discovery only after the SDK authenticates the
refusal receipt: receipt signature/keyset/version, exact request and response
hashes, failed required upstream verification, and no forwarding event. The
expected overall serving verdict is failed; the four receipt authenticity/hash
checks must independently pass. The gateway identity policy is unchanged.
A signed refusal is not accepted as a successful inference result. Two proven
refusals release the reservation as `not-dispatched` and retain their signed
receipt documents. A timeout, upstream failure, missing proof or unknown second
attempt keeps its reservation; a previous proven refusal cannot clear a later
unknown outcome. Successful retries preserve refusal records and the successful
receipt ID with priced usage. The maximum is two attempts, never a fallback to
an ordinary provider or an unpinned serving session.

The [ACI serving-constraint contract](https://github.com/Dstack-TEE/private-ai-gateway/blob/main/spec/aci.md#53-serving-constraints-aggregators)
describes `session_not_accepted` as refusal before forwarding. The two failed
20 October attempts predate receipt-ID retention; no proof has yet been recovered
for those existing holds. They remain unresolved pending provider records.

A known unsupported-claim judgment permits one separately metered draft revision
using the supplied evidence and rejected claims. The revised draft must satisfy
the same length and sampled source/quotation checks before any completed report
is committed. A second rejection stops the action. Transport, usage, receipt
and other unknown failures never trigger revision or replay. Validator-created
rejected-claim details may be stored only inside the encrypted action receipt,
then displayed as plain text to the owner; arbitrary exception properties cannot
enter that diagnostic. Private public-search fields start empty instead of
copying the private research question into external query terms.

The browser adapter rehydrates the worker's paired encrypted discussion messages
into the shared UI and derives its fifty-question limit from the hundred-message
worker limit. Successful replies return authoritative remaining counts through
a fresh encrypted-manifest read. Private preview copy identifies owner-funded
usage instead of ordinary free-follow-up or escrow-refund semantics. Saved
content remains readable while workflow readiness disables new worker actions;
public Hub source-card lookup remains a separate explicit action.

## Hosted JEV protocol (owner preview, 19 October 2026)

The guest calls the native OpenRouter Decisions endpoint directly, pinning
TypeSafe and JEV 1.13, requiring ZDR/no-data-collection and disabling fallback.
Selected question/evidence/proposal context is readable by OpenRouter/TypeSafe;
no ordinary Nibgate endpoint receives it. Native choice/score/noul results and
model/usage are validated. The measured compose binds opt-in, provider-visible
disclosure, successful native route review, workspace identity and logging-review
time; the sealed environment supplies only the credential. Startup checks key
workspace metadata; each dispatch checks the review is no older than 24 hours.
Unknown outcomes retain durable reservations and block replay. JEV accounting is
provider-reported `accounted`, never attested `verified`.

Bounded agent proposals permit only local evidence lookup/arithmetic, retrieval
with the exact separately approved public brief, or writing. Actual JEV gates
execution and scores source relevance/trust/quality. Deterministic egress policy
and limits apply even after approval. Encrypted events distinguish judgments
from fixed stage notes. Current run/release evidence and remaining legacy parity
are recorded in STATUS.md.

## Priced usage provenance (local migration 0011)

Each new inference row includes `costBasis` and bounded `usageEvidence`
(input/output token counts, integer micro-USD reported cost, request/response
digests for receipt-priced Qwen or provider request ID for hosted JEV). No prompt
or response content is included. `receipt-reported` and `provider-reported` are
eligible for finalized customer costs; `legacy-ceiling` is historical estimation,
`reservation` is unresolved admission, and `not-dispatched` is proven zero spend.
The v2 usage summary separates those buckets. New pricing uses reported amounts
rounded up per call to micro-USD, never the larger token-price ceiling. Missing
price retains a hold and prevents settlement. Historical estimates are not
silently converted into customer charges. This local change is not deployed in
the previously reviewed image; release evidence must be regenerated.

## End an uncertain private run (local candidate)

POST `/v1/private/runs/:runId/escrow/cancel` with `{}` uses the same owner/session
checks as the money routes. It requires no project key or running guest. It
fences new inference (including sponsored stages), progress and late action
commits; existing saved ciphertext stays readable. Financial cancellation and
the finalized customer-charge snapshot commit atomically. Unconfirmed calls
are excluded from the customer debit and remain platform provider liability
under the existing global admission holds. The response is pending until chain
settlement/split confirmation; `/escrow/complete` retries that exact frozen
amount. No automatic inference retry or removal of historical holds occurs.
A cancellation with an Open, unfunded job stays pending; after a late wallet
funding confirmation, status records the deposit and settlement can retry.

Funding preparation/registration now also require a measured planning proof
binding the encrypted manifest digest and the exact current source ciphertext
set (or approved public search). Source changes invalidate that proof. The
browser verifies upload read-back and checks source readability before planning,
funding and execution. Neither ordinary broker nor funding service gets source
plaintext or approval-query text.


## Browser-independent settlement recovery (local money service)

The funding process starts an owner-scoped 15-second reconciler over terminal
or explicitly cancelled funded runs. It uses only public money metadata and
calls the existing idempotent settlement operation; it never reads content
keys or bodies, calls models, or changes frozen amounts. Failed/pending splits
remain queued across process restarts, with cursor pagination preventing one
batch from starving later runs. Browser settlement requests remain optional
fast-path hints. No refund is recorded until split confirmation. Separate DB
transactions use a bounded 60-second timeout; all chain calls remain outside.

Private approval acknowledges background dispatch immediately so the existing
frontend navigates to the run page while the encrypted action completes.
Lost replies are resolved through durable receipts, never paid inference
replay. Read-only progress can display running state before manifest commit.
Agent proposal summaries and judge choices remain inside encrypted progress;
the UI exposes recorded explanations and judgment inputs, not invented private
reasoning. The source-preview length/truncation correction remains local until
a fresh measured guest release is reviewed.


## Agent explanations and observations (local candidate, 19 October)

The activity contract distinguishes system stage notes, model-authored action
summaries (`origin: model-summary`), native JEV outcomes (`judge`), actual tool
observations (`tool`) and sampled source checks (`verification`). The model
proposes `{tool,input,why}`; why is an intentionally concise user-facing account
of the goal/evidence/uncertainty, not a claim to expose every internal reasoning
token. JEV's probabilities remain its actual typed output; no verbal rationale
is invented for a model that did not return one. No separate explanation call
or external telemetry/tracing service receives content.

The owner can inspect the proposal, relevant candidate question, judge criteria,
inputs and output. Bounded candidate/proposal context also travels inside the
encrypted progress snapshot before final manifest commit. Tool completion flushes
that snapshot. Evidence-search results retain up to four actual 1,700-character
chunks, source IDs/indices and explicit count/truncation information; the next
proposal receives structured observations rather than a 500-character fragment
of JSON. Untrusted observations remain data, never new tool permissions.

Private activity subscriptions emit one UI refresh per changed decrypted
snapshot, including shrink/reconnect cases. They do not trigger a project reload
for every historical row, spawn duplicate fallback pollers, or re-run inference.
The terminal page separately refreshes pending financial receipts until chain
confirmation, since a payment update does not mutate encrypted research state.

Research basis: [Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
recommends visible plans and using real tool observations to assess progress.
[Anthropic, Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)
describes plan approval and layered tool/environment controls. We apply these
principles through the existing encrypted workflow; a readable narrative does
not substitute for observed tool execution or claim verification.

The local recovery candidate corrects completed invalid/truncated JSON proposals,
unsupported tool names, malformed pure-local calculation/evidence-search inputs,
and an incompatible non-report JEV `answer` choice within the existing bounded
research loop. Rejected actions do not execute. A fixed recovery note is encrypted
into activity; every additional model request still passes the existing budget
admission and usage accounting. Non-report native JEV criteria omit `answer`.
No provider/receipt error, uncertain inference, payment, attestation or policy
failure is converted into a blind retry. Recovery does not reset the step limit,
escrow or budget. A final report remains subject to evidence verification.

Known paid-research failures remaining after bounded recovery, with no reserved model attempt, atomically commit
an encrypted failed manifest and failed receipt, retaining authenticated progress
and older reports. The public coordination status is failed; the money service
can settle only finalized customer costs and refund the remainder. Intake or
planning failures remain editable. Unknown outcomes remain uncertain with their
reservations and replay barrier; a fixed error string alone cannot authorize
settlement or a duplicate model call.

## Owner-approved public tools (local migration candidate, 19 October)

The private worker proposes and JEV judges `web_search`, `web_fetch`,
`http_request`, `unlock_content`, `pay_x402`, `tip_creator`, and `rate_content`.
A source-only run rejects these operations. A public research approval is not a
blanket payment or arbitrary-context disclosure approval: each external tool
parks the encrypted checkpoint with its exact public JSON arguments and an
integer micro-USD maximum. The owner approves or skips in the existing research
page. No worker wallet key or document decryption key crosses this boundary.

The separate owner-authenticated money service supports:

- `POST /v1/private/runs/:runId/tools`: register `{id, manifestRevision,
  questionId, recipientPublicKey, request}` against the current awaiting run.
- `GET /v1/private/runs/:runId/tools/:id`: recover status and encrypted result.
- `POST /v1/private/runs/:runId/tools/:id/execute` with `{}`: reserve the exact
  approved ceiling under the shared run-budget lock, then dispatch once.

These are dedicated owner-rehearsal routes, not production Hub/MCP endpoints.
They require the authenticated owner and configured test tenant. Registration
binds the current encrypted manifest revision; active/uncertain actions and
closed/cancelled budgets block new dispatch. The server stores the approved
public request, request digest, money status, receipt references and HPKE
ciphertext of the tool result. The browser opens that ciphertext with its
project-derived recipient key, then sends the result through the attested
session as an encrypted `answer`. The guest checks the question ID, exact
request digest and result digest against the authoritative financial row before
using it. Browser-submitted prices never authorize a debit.

The money service and external destination see the approved public arguments
and response. They do not receive private research state or project keys.
Explicitly approving document text as a public request would disclose that
text; encryption cannot hide content intentionally sent to an external tool.
GET/HEAD/JSON POST are bounded, arbitrary headers and credentials are denied,
and DNS-pinned public transports reject private addresses. The exact approved
HTTP request and paid transport do not follow redirects. Paid execution is
currently hard-gated to the dedicated testnet configuration. Unknown payment
outcomes remain reserved and cannot be retried as a new purchase.

`run_code` instead stays inside the measured worker: a fresh QuickJS WebAssembly
interpreter accepts a JavaScript function body plus JSON data, returns bounded
JSON, has no host filesystem/network/environment/module bridge and is limited
to 16 MB interpreter memory, 2-second instruction deadline and 5-second parent
termination. This does not provide Python, shell commands or package installs.
Its result is checkpointed before subsequent reasoning. Ordinary Node is never
used to evaluate model code.

Round reviews reuse the original structured review prompt and actual JEV
continue/write decision within depth limits. Reviews and mid-run questions are
encrypted progress, not hidden chain-of-thought disclosure. Owner questions
pause provider work until answered; three clarification questions and twelve
external approvals are bounded separately. Resume/recovery replays durable
results, never unresolved side effects. Migration 0013 adds the separate
`PrivateToolCall` money table; the worker can read financial proof columns but
cannot write charges. The money role cannot read encrypted project contents.

### Batched external payment finality (19 October candidate)

Payment resource metadata is bound to the approved request URL. A creator SDK
`/api/nibgate/access` request with exactly one `path` parameter may declare that
same-origin canonical article, including a relative article URL. Other resource
substitutions, origins, credentials, fragments and ambiguous parameters fail
before authorization. Validating this metadata never fetches its declared URL.

An x402 success header and settlement UUID are not a finalized charge. The
separate money service journals the public authorization nonce/payer/payee/amount
before dispatch, encrypts the returned result, and reconciles directly against
Circle's testnet transfer API. Every attribution field must match. Only a
confirmed/completed transfer with its batch transaction hash finalizes the
expense. Received/batched transfers retain their hold; retrying checks the
existing transfer without another purchase. Failed transfers release the hold.
Cancelled/frozen runs cannot receive late charges.

For older creator SDKs that omit the payment-response header, the exact SDK
body (`circle-gateway`, verified network and settlement UUID) is only an
untrusted reconciliation hint. Circle still independently verifies attribution
and finality. An SDK unlock proof is redeemed once against the same approved
access URL, without resending the payment signature or following redirects.
Proofs and authorization blobs are stripped before returning article evidence.
A payment acknowledgment is never substituted for article content.

If Circle confirms a dispatched purchase but both encrypted delivery fields are
absent, recovery seals an explicit content-unavailable result and records the
verified provider expense as platform-sponsored with zero customer charge.
It never replays that authorization. Partial delivery records remain blocked.
A replacement purchase requires separate owner direction and admission within
the original escrow budget. A proven pre-dispatch failure may be re-admitted
only with zero commitment and no payment journal, result or transaction hash.
Real payment acceptance is still required; synthetic fixtures alone do not
demonstrate seller settlement.


### Creator preference and full Linux terminal (local candidate)

The existing extension page model assesses already-fetched public HTML inside one
reusable ordinary public-tools worker with page scripts/resource loading disabled.
The existing Hub resolves verified recipients; it does not run the extension
DOM classifier. Normal shared retrieval/detection receives only the exact
setup-approved public query/preference, never uploads or private research state.
The browser continues that already-approved free query without another prompt;
other external bytes/payments still require exact approval. No search or DOM
detector process runs in Phala. Search
reuses the exact approved query with provider mixing and creator-page preference.
With creator preference enabled it also queries the existing canonical Hub
`/hub/explore/content` endpoint once, without authentication or purchase, on the
configured mainnet/testnet Hub. Hub metadata gets priority on relevance ties;
failed/empty Hub results retain the wider web fallback. Hub membership and
creator eligibility never substitute for evidence relevance or reliability.
With tips enabled, the post-report stage considers eligible actually cited
creator pages. Actual JEV receives the research question and report excerpt,
favors appreciation for substantive attributable original work, and chooses a
meaningful positive amount within the authoritative protected allocation.
Original fiction/satire qualifies as evidence about itself, never as proof of
real-world claims. Prior access purchases reduce available funds but do not
disqualify appreciation. An ineligible JEV recommendation is disclosed and
parks for owner approval or explicit decline rather than silently settling.
The independent citation/trust/detector checks remain mandatory. Exact URL/amount approval and
payment-service admission still precede every transfer. The full estimate stays
reserved and the aggregate tip pool cannot exceed 20% of the run cap.

`run_terminal` is a distinct real Bash/Python/Node/curl tool. It runs through a
pinned gVisor companion inside the same confidential VM, without worker/wallet
credentials or ordinary remote sandbox fallback. Commands run as UID 1000 with
no capabilities, bounded resources, public runtime libraries, selected files
and isolated temporary storage. The launcher uses a measured default-deny host
syscall profile with one SYS_ADMIN-scoped `pivot_root` addition; its setup
permissions are not passed to research commands. Small selected text artifacts
are checkpointed in encrypted project state.

Direct outbound sockets are blocked. Each proposed public HTTP request is
separately approved and executed by the existing public-only transport. Its
real encrypted result seeds the job-local HTTPS response cache for curl/Python;
other URLs, methods and bodies remain blocked. Paid APIs use the separate
budgeted x402/unlock tools, never terminal-held credentials. Compute remains
operator-funded and unmetered per run. See `CREATOR-DISCOVERY.md` and
`../private-terminal/SECURITY.md` for limits, references and remaining acceptance.

Owner review can call `POST /v1/private/tools/check` with `{}` and a one-use
`tools:check` capability. This dedicated guest-only route exists only when
review attestation and the terminal port are configured. It executes fixed
synthetic runtime/package, artifact, isolation and HTTPS-cache checks; it accepts
no commands, project content or external request arguments. Only a fixed boolean
readiness/check-name result can leave the guest. Success is cached per boot;
failed attempts are rate limited to three. It never invokes a model, payment,
escrow or research action. It is not a public Hub/MCP research endpoint or an
escrow bypass. Native checks still consume operator-funded infrastructure under
the existing approved test ceiling.

## Journal-proven recovery and uncertain activity (19 October candidate)

Both expired processing and uncertain receipts may advertise eligibility for an
attested recovery check. This broker flag never authorizes replay. The guest
authenticates the encrypted journal and current manifest digest/revision under
the run lock, requires every journal entry complete and zero unresolved model
or public-tool reservations across the run, then rotates the lease owner on
the original request. Old workers remain fenced. An uncertain receipt receives
a fresh encrypted progress envelope before replay; no new escrow is created.
The client admits at most one automatic check per original request across
reloads, only with funded escrow and enabled private actions. Manual checks
remain available. An unfinished entry returns an optional encrypted `event`
envelope with fixed error/operation categories, never a raw exception, input
or tool result. Broker and guest response validation bind that envelope to the
same tenant, run and request. Unknown outcomes cannot be promoted to completed.

Uncertain actions render paused, rather than displaying approval for a new run.
The cumulative expense breakdown is available while active or paused. A stopped
reviewed worker suppresses active-work animation. Terminal input validation
errors before dispatch trigger bounded proposal correction; storage transaction
timeouts remain uncertain with a fixed category. A terminal invocation without
a durable result is still blocked; this candidate does not blindly rerun it.


## Completed report-check repair (local candidate, 19 October)

A completed verification response with malformed JSON, citation indices or
nonliteral quotes may receive one correction request. The response/receipt and
accounting call finishes before pure output validation; transport, attestation,
receipt and unknown-charge failures never enter that retry. The corrected
response must pass the same literal source matching. Unsupported report content
continues to use the separate single draft revision and reverification bound.
Unknown judgments never become supported claims.

After those bounds, a validator-authenticated output failure becomes the fixed
encrypted `PRIVATE_REPORT_REPAIR_REQUIRED` receipt. It leaves the action
uncertain/reviewable, retains its original journal and keeps project escrow
open. It must not set run status failed or trigger settlement. A journal check
replays already-recorded operations rather than buying them again; exhausted
saved checks still require further repair or an explicit owner decision to end.
The automatic once-per-original-request guard prevents background retry loops.
No public research content, quotes or exception text enters this fixed code.

This behavior passed the subsequent real job-49 report recovery (see STATUS.md).
The earlier job-48 live release failed a quote check and refunded its deposit. That confirmed settlement is historical and cannot
be reversed by changing the local status or fabricating a new funded balance.


## Evidence exhaustion recovery (20 October local candidate)

A funded agent pass that cannot retain usable evidence emits the fixed encrypted
`PRIVATE_EVIDENCE_REPAIR_REQUIRED` diagnostic. Its action receipt remains uncertain
and the original checkpoint and escrow remain open; it cannot trigger automatic
settlement or a replacement purchase. This differs from configuration-time
`PRIVATE_SOURCE_REQUIRED`, which still rejects a missing upload before dispatch
when public research is disabled. Replaying a completed but exhausted journal
does not manufacture evidence or authorize another purchase; further repair or
explicit owner direction is necessary.

## Recovery controls and temporary service failures (20 October local candidate)

A temporary service failure preserves the funded action and escrow. The browser
shows a recovery-status check while its lease is held, then a journal-check and
resume control after expiry. Checking never admits a duplicate operation: unknown
model/tool results remain blocked for reconciliation. Background action outcomes
notify the view independently of manifest changes so a failed check cannot leave
it displaying Running forever. Explicit owner end/cancel remains separate.
The expanded temporary-service classification is locally tested, not yet part
of the reviewed deployed image.

## Initial inference admission reconciliation (20 October candidate)

Recovery may remove a single started initial `infer` journal entry only inside
the measured worker, after an authenticated finalized storage-timeout receipt,
an expired lease, unchanged manifest/request binding, zero inference admission
rows for that action (including zero-dollar and not-dispatched rows), and zero
tool rows for the run. The monthly admission lock and run lock cover the check
and takeover. Both inference adapters require a committed reservation before
provider dispatch; lease expiry or zero cost alone is insufficient proof.
An encrypted reconciliation note records the decision before the original
request ID resumes. Any other unfinished operation remains fenced. No receipt,
usage row, escrow job, payment or project key is fabricated or deleted.

Confirmed Circle-pending tool executions are checked automatically against the
same approved tool ID, up to 30 checks spaced ten seconds apart. This checks an
existing dispatched transfer; it never creates another tool approval or payment.
Unknown outcomes without confirmed settlement-pending evidence stay blocked.
A reload or expired checking window retains the same durable approval/transfer.

## Explicit creator text as the object of study (20 October candidate)

When the brief explicitly names the canonical URL of a purchased creator work,
retain that original for analysis just as the owner's uploaded originals are
retained. If the general factual-evidence review rates it low, preserve that
judgment and ask JEV separately about its narrower role as a source describing
its own text. This does not make fictional events, advice or outside factual
claims true. Unrequested irrelevant public sources are still filtered; tips
still require the independent trust, citation, creator and budget checks.
Completed purchase/model/judgment entries replay from the encrypted journal;
a repaired context review appends a new decision rather than charging for old
results again. Owner-readable operation diagnostics decrypt only in the browser.

## Output headroom under both AI limits (20 October candidate)

Inference admission retains the conservative input bound and applies both the
authoritative funded-run balance and the cumulative monthly AI ceiling under
one database admission lock. When the requested maximum output cannot fit, it
reduces only output headroom, retaining at least 1,024 tokens (or a smaller
explicit request). Existing held and legacy reservations remain committed. If
that minimum cannot fit, the call is proven not dispatched, its journal start
is removed under the trusted no-dispatch marker, and the checkpoint/escrow
remain recoverable. Actual signed usage replaces the reservation after success;
this never raises either limit or treats a reservation as an invoice.

## Read-only export failure and billing view (20 October candidate)

A completed/ended/failed encrypted manifest retains its terminal research status
when a read-only export receipt is uncertain. No UI claim about escrow remaining
open may override its authoritative settled receipt. Export-only failures with
zero inference rows are final failed export attempts, without failing research.
A previously uncertain export may regenerate only under the same keyed request
digest and expired lease on a terminal run, with zero inference rows for that
action. Changed formats/arguments, live leases and inference-bearing attempts
remain blocked. No paid operation is repeated by this exception.

Receipt rendering reads `PrivateToolBillingMetadata`, a narrow view exposing
only sponsored billing kind, gross amount and provider-cost amount. Guest
permissions continue to deny the raw payer journal, public tool payloads and
charge writes. The existing funding role also reads this view.

## Production lifecycle status

The local candidate now uses PostgreSQL lifecycle intents, request leases,
background execution-lease counts, bounded pending/active dispatches and a separate
watchdog entrypoint. Availability and saved-status reads do not start compute.
The browser explicitly requests wake and polls before opening its verified session.
Same-CVM owner/policy mismatch fails closed. See
[LIFECYCLE-ACCEPTANCE-2026-10-20.md](LIFECYCLE-ACCEPTANCE-2026-10-20.md) for the
isolated stress/crash evidence and real stopped-to-verified-ready measurement.

This is still an owner-scoped canary candidate. The lifecycle migration/grants,
independent watchdog supervision and fresh-boot browser verifier policy need
canary deployment/acceptance. Current client-assisted project-key delivery is
not unattended multi-tenant restart support. Private report narration changes
are local and require the next reviewed guest image.
## Browser question history

The authenticated owner client reconstructs answered research questions from
the encrypted checkpoint objects. It selects only question prompts, options,
approved public requests and actual replies; full model/tool results and keys
are not copied into chat history. This is a read-only display overlay and never
rewrites the worker manifest or replays an operation. Intake records remain in
the manifest's question decisions. Keep checkpoints while their project is
retained so completed runs preserve the same Q&A history after reload and
recovery. Display summaries are cached by encrypted object revision; no new
plaintext server record is created.


## Public URL reads without search (local candidate, 20 October 2026)

New configure requests separate `liveWeb` (public tools may ask for exact owner approval) from `searchEnabled` (web/Hub discovery). With `liveWeb:true, searchEnabled:false`, `publicResearch` is cleared, no search terms are required, and the worker rejects both `public_research` and `web_search` proposals before JEV or dispatch. Direct reads still park for approval of the exact URL/request. Enabling search requires the existing validated `publicResearch:{approved:true,brief}`. New configuration stores an explicit boolean; legacy checkpoints retain their prior search behavior. Source readiness/funding accepts either an uploaded source, enabled URL reads, or approved search. The public readiness bit describes permission to acquire evidence, not an executed search or a plaintext source.

New plans carry `qualityPolicyVersion:2`. Review prompts identify already retrieved evidence, include more stored text with bounded previews, and distinguish search excerpts from retrieved bodies. Short reports omit the separate abstract call; their configured target applies to the body. Writer guidance preserves conditions and exceptions and requires reconciling overbroad secondary-source assertions against authoritative evidence. This is a quality control, not a guarantee that every generated statement is correct. Legacy executing checkpoints retain the prior prompt shapes.

Export receipts retain six decimal places for USDC in text and rich formats. An unconfirmed refund remains labeled pending. These are presentation changes; no price, platform fee or settlement calculation changes.

## Forwarded 429 and account cooldown (20 October local candidate)

A 429 is an uncertain provider outcome, not zero-cost evidence. The ACI adapter retains only the fixed status, exact request digest, receipt ID and bounded Retry-After timing; it does not consume provider error content. Decimal seconds and HTTP dates are supported, with a 60-second default and one-hour upper bound. The shared channel factory refuses fresh connections during cooldown. Under the admission lock, the workflow also checks persisted 429 evidence across runs for the approved model, so restarting the worker cannot bypass an active cooldown. A locally blocked attempt is provably not dispatched and does not create a new reservation. The original forwarded attempt remains reserved. Expiry permits admission of independent work, never replay of the uncertain action.

Releasing or repricing a forwarded hold still requires exact request-linked provider usage evidence. A signed receipt with request.forwarded and response hashes but no retained response/usage does not suffice. Missing dashboard rows, elapsed time and account-credit differences cannot establish a zero bill. The original encrypted journal remains blocked until the corresponding operation outcome is established; cooldown handling does not manufacture a completion.

## Setup-stage checkpoint coverage (20 October follow-up)

Intake, answer acknowledgment, finishing intake, planning/configuration, plan edits and report discussion now receive the same encrypted operation journal as research execution. Completed inference and JEV results are persisted before manifest finalization. A later final-save failure can replay only the saved results after the expired lease, owner key, request digest, source/manifest revision and zero-unresolved-operation checks pass. Research duration remains scoped to research execution; setup journaling does not change that timer. Recovering a planning action uses its original action descriptor to commit source-bound funding-readiness metadata.

This cannot reconstruct content from old setup actions that ran before journaling was enabled. An old receipt containing only charge evidence is not a model response. Existing forwarded inference holds stay reserved unless request-linked accounting evidence resolves them.

Authenticated record GETs can retry two transient network/502/504 failures or a fixed Hub account_unavailable 503 within the original deadline. Writes, provider 429s, authentication failures, conflicts and generic storage errors never use this reconnect behavior. Retrieving a completed encrypted receipt does not invoke inference.


### Rate-limit diagnostic evidence

On an HTTP 429 the local candidate records bounded numeric `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-limit-tokens` and `x-ratelimit-remaining-tokens` headers when present. `retryAfterSource` distinguishes valid provider Retry-After advice from the local 60-second fallback; both retain the existing bounded cooldown. Submitted request byte count and maximum output tokens aid quota diagnosis without retaining prompt content. These unverified transport metadata are admission/diagnostic hints, never billing or non-dispatch evidence. Unknown headers and upstream error bodies are excluded. A signed forwarded receipt still requires request-linked final usage/outcome reconciliation before replay.


### Explicit alternate-model release

The owner-only release tool accepts the explicitly reviewed `phala/gemma-4-26b-a4b-uncensored` instruct route as an alternative to `qwen/qwen3.8-27b`. Model ID and per-million token price ceilings remain literals in measured compose; credentials remain encrypted. This is an explicit release selection, not automatic fallback. The same attested SDK channel, live canonical-model session discovery, mandatory upstream verification, zero-retention/deny-data-collection routing, disabled fallbacks and signed exact request/response usage verification apply. Gemma's stage profile omits unsupported `reasoning_effort` while retaining temperature/output bounds. JEV remains separate and unchanged. An unresolved operation under the previous model is preserved and cannot be silently replayed under a new model. New live acceptance uses a separate test project and the unchanged cumulative cap.

### Exact-source recovery and local authentication transport

New research journals mark `toolPolicyVersion: direct-urls-first-v1` and propose bounded reads of the exact HTTPS URLs in the research brief before free-form discovery. Every read still requires JEV approval, exact owner disclosure and the existing request/budget controls. Existing journals preserve their original inference/judge ordering; only at their empty-evidence boundary may they append the bounded requested-URL reads. Completed operations are restored from the encrypted journal, rather than purchased again. Search-disabled scope remains enforced independently of URL access.

The local rehearsal can explicitly select the existing testnet Railway service hostname as its Hub authentication transport when the custom domain is unreachable from the device. The transport helper accepts only that verified service and fixed authentication paths, preserves TLS and response-origin checks, and never forwards arbitrary destinations. The broker and funding verifier configure the actual selected authentication origin before startup; owner and wallet checks remain live. This is local tooling, not a production DNS change or an authentication bypass.

### Measured confidential model pool (local canary candidate)

Release preparation now writes a literal `PRIVATE_AI_MODEL_POOL`, default `single`. Explicit `gemma-qwen-canary-v1` enables the closed reviewed Gemma/Qwen pool described in [PHALA-MODELS.md](PHALA-MODELS.md). Runtime rotation occurs only after proven non-dispatch availability failures. Per-model metering, shared caps, exact attested serving sessions, receipt-bound actual cost and encrypted checkpoint ordering remain enforced. Forwarded failures and outstanding reservations block replay across models. Attestation/receipt failures do not trigger fallback. Strict mode has no ordinary OpenRouter research route; the separately authorized hybrid mode below is distinct. The hosted JEV disclosure is unchanged.

### Explicit hosted ZDR fallback canary

Owner-authorized `phala-openrouter-zdr-canary-v1` is a distinct measured mode. It uses Phala Gemma first, then the fixed OpenRouter `openai/gpt-4o-mini` / Azure endpoint. Provider preferences enforce `zdr:true`, `data_collection:deny`, `only:[Azure]`, `allow_fallbacks:false` and required parameters. Its account workspace must match the fresh reviewed no-logging workspace. Credentials are encrypted secrets; model/provider, prices and policy are measured code. Hosted results use provider-reported accounting and explicit provider-visible provenance, never attested-receipt labels. JEV remains unchanged. The private client displays disclosure before execution and labels actual fallback responses. Strict mode retains its existing behavior.

For definite Phala HTTP 429 responses, this mode keeps the full committed reservation as `rejected-held`, changes its billing responsibility to the operator, and permits a bounded retry/fallback. An encrypted journal recovery requires the authenticated action's 429 failure, a single matching reserved inference, one final started inference entry, matching manifest generation and expired owner lease. All completed entries are preserved; at most two such journal repairs are allowed. Unknown responses, tool operations, mismatched actions and ambiguous admissions do not qualify. The full retained amount still counts against the global allowance; no provider zero bill is fabricated. Customer settlement excludes operator exposure. The browser schedules one guarded recovery check after the lease becomes available; the worker independently enforces these rules.

## Interrupted model completion recovery

Under the admission and run locks, recovery requires an expired processing lease, the same authenticated manifest revision/digest, exactly one final unfinished `infer` entry, exactly one reserved call for that action with no final usage evidence, and no reserved public tool. The call becomes `uncertain-held`, `platform`, `operator-reservation` without reducing its commitment. Only the final inference entry is removed; all completed results are retained. The new lease fences the old worker. At most two such replacements are admitted per journal. Every replacement still passes ordinary per-run and monthly budget admission. A late verified response can reconcile the operator cost but cannot change the call back into a customer debit. This path never declares an unknown outcome completed and never repeats terminal, public retrieval, paid access, tip or settlement operations.
