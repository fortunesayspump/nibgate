# Dr Nib privacy implementation status

Updated 18 October 2026. The normal product is unchanged. The owner preview uses
the existing screens on localhost with a dedicated real Phala guest. No Git
commit/push or public frontend deployment has occurred. Full migration and
production readiness are **not established**.

## Current release and authorization

The owner authorized the dedicated guest/image, additive private test DB changes,
real browser E2E and up to **$0.65 AI plus $0.35 infrastructure**. These do not
authorize tips or other wallet payments. The AI admission ledger totals
495,126 micro-USD in verified costs plus conservative reservations as of the
latest audit; no unknown reservation has been released.

The final claim-correction update is deployed and has passed fresh full-verifier and
production QVL review. The local client pins its reviewed boot manifest:

- Image: `docker.io/fortunesayspump/nibgate-private-guest@sha256:e9b36389607d049f8dacb1554bf94e23c44dee4586c88ee9ee7f6084cf5714fb`.
- Independently computed compose: `bdb19824bb4c47fd3f2eddc6dfe0307fca877f74974d05face72be41a31c6eee`.
- All 301 image source/schema hashes and runtime imports matched the checkout at release verification. Subsequent local progress and hosted-JEV work is not in that image; the current checkout no longer matches that release.
- The guest was stopped after the test, confirmed by a fresh control-plane read. The stop guard was cancelled only after that confirmation. A local timer is not a provider billing guarantee.

Manifest SHA-256: `1b3d959ec45ac5105c59296edbcade518497d8ba4cba0eca89fca79f3a676898`.
The quote, event log, OS image and ACPI checks passed with UpToDate TCB and no
advisories. Independent OS/KMS/app/instance pins were retained; SSH authorizations
are empty, public diagnostics are disabled, logging is `none`, and secure time
is enabled. A restart or new image requires fresh review. The guest is **stopped** after the completed test.
The local broker keeps encrypted records available and advertises workflow
actions and public retrieval as paused. The report view preserves content and
discussion while disabling new worker actions with an explicit paused message. The owner explicitly reallocated $0.10 from AI to infrastructure
while preserving the same $1.00 combined maximum.

## Implemented boundaries

- Random browser vault/project keys, transactional IndexedDB enrollment and saved recovery-code unlock; encrypted key bundles synchronize through owner-authenticated ciphertext APIs.
- Client encryption of questions, answers, filenames and original uploads; encrypted manifests, reports, discussions, exports and action replies. R2 holds encrypted originals; Postgres holds encrypted state and opaque accounting metadata.
- Fresh hardware evidence, independent release pins and HPKE possession proof precede project-key release. Measured compose binds owner, broker key, inference identity/model, prices and budgets; encrypted environment credentials cannot silently change those policy pins.
- Shared ordinary generation functions operate through a protected model port. Private failures cannot invoke ordinary inference, JEV or arbitrary network/code/MCP tools.
- Approved public search uses only the visible brief, up to 400 characters. Wikipedia/OpenAlex/Crossref run in parallel; six mixed-provider results and four bounded extractions share a fifteen-second deadline. External providers see query terms and URLs. Excerpt-only evidence is identified in the writing prompt.
- Manual public-source tips use existing Hub/wallet rails with a minimized public URL payload and user wallet approval. The document worker has no spending key or autonomous payment tool. Rendering a source makes no Hub payment request.
- Durable inference reservations and one active action per project prevent automatic paid replay. Unknown outcomes remain reserved and block further dispatch in that action.

## Real evidence so far

Run `6ec5eabe-5a09-44e1-a5ab-1c88ec25a4c6` completed the real localhost Chrome →
reviewed Phala flow: intake, encrypted answers, browser-encrypted file upload,
planning approval, approved public retrieval, report writing, one metered content
correction, and final validation with **8/8 sampled claims supported**. The report
correctly presents 126 L versus 98 L, a 28 L / 22.2% difference, 1.80 kg versus
1.86 kg harvest totals, missing per-plant variance and bench/light confounding.
Sample checks do not validate every report sentence.

A real private follow-up completed and persisted across browser reload. The
worker's paired messages now map to the existing UI with **49/50** follow-ups
remaining; the owner preview no longer claims free inference or an escrow refund.
All **seven actual exports** completed and appeared in Chrome Downloads:
`report-v1.md`, `.json`, `.bib`, `.pdf`, `.docx`, `.xlsx`, `.pptx`. These are
download/flow checks, not a complete visual review of every binary format.
The normal Hub lookup opened the public academic source's tip card; no payment
was made. These twelve actions completed with no uncertain action in this run.

The run's **12 verified model calls total 28,448 micro-USD ($0.028448)**, including
the revision and discussion. No export required inference. A read-only final
audit found no topic, filename or document canary in ordinary project/object/action
records or the R2 source object; context and ciphertext digest matched. This is
a bounded canary audit, not proof of every possible side channel.

Earlier attempts were retained without reset or replay:

Run `04fd6125-e727-4814-95b8-7f5081fb0dbb` also completed approved public retrieval
and every writing/model call, then failed final source-check validation. No
completed report was saved and its failed action was not reset or replayed.
Its nine verified calls, including intake/answers/plan, total 16,392 micro-USD.
The next run, `d9dfd936-4151-4ffe-beac-189cfc95da5d`, passed intake, answers,
encrypted upload, planning, public retrieval and writing, then failed a known
unsupported-claim judgment. Its verified calls total 14,033 micro-USD. Its action
was preserved, without reset or replay. The latest release permits one separately
metered correction only for that known content rejection, rechecking the complete
result before committing. Unknown calls never retry. Rejected-claim diagnostics
remain inside encrypted receipts.

A read-only audit of that run found no topic, filename or document canary in
ordinary project/object/action records or its R2 source object. The source's
context and ciphertext digest matched. This is a bounded canary audit, not proof
of every possible side channel.

Real public-only workstation probes verified model receipts and accounting.
High effort returned 8,199 completion tokens for a 512-token request and was
rejected by the meter. An explicit reasoning-budget object was rejected by the
route. Low effort returned 39 tokens within a 2,048-token request; the full public
intake prompt also passed. Research now uses low effort with strict total-output
bounds. Serving discovery now uses the same verified channel as completion.
A later real call exposed HTTP 412 `session_not_accepted` during serving-session
rotation. The final local adapter discovers up to sixteen approved same-model
sessions through the verified channel, commits that set in the request, and
requires the signed receipt's actual session to belong to that exact set. It
does not retry a paid completion. A real public-only verification-contract call
using that fix passed eight supported claims with exact quotations and verified
receipt accounting (1,129 micro-USD). That is not a completed browser report.

The final reviewed image is
`fortunesayspump/nibgate-private-guest@sha256:e9b36389607d049f8dacb1554bf94e23c44dee4586c88ee9ee7f6084cf5714fb`;
all 301 source/schema hashes and runtime imports matched the checkout.

The real Hub public-source lookup returned HTTP 200 with localhost CORS; no
payment was submitted. Full model quality parity is unverified.

The local progress/JEV changes pass **292 privacy/crypto/release tests**, **390
backend tests in 53 files** on disposable Postgres, and frontend TypeScript.
The targeted seven-test private-vault integration suite also passed. The completed
browser flow is separate evidence from those tests.

## Owner continuation decision: actual JEV required

The owner explicitly rejected replacing the TypeSafe JEV model with a generative
judge. Preserve the original propose → JEV judge → execute design. The real
JEV route currently uses OpenRouter's Decisions endpoint; the confidential
completion route has not established a native JEV serving boundary. TypeSafe's
public enterprise docs offer ZDR, but an attested JEV deployment has not been
confirmed. Opening the enterprise FAQ in Chrome confirmed its current answer:
JEV is hosted-API only, with no own-VPC/on-premises option. Hosted requests are
readable to the inference provider; no-training and ZDR do not make inference
provider-blind. Account-specific ZDR has not been verified. No ordinary Nibgate endpoint may receive private research content. The
original pipeline, escrow and activity parity map is in PLAN.md. Source:
[TypeSafe enterprise](https://typesafe.ai/enterprise),
[TypeSafe model contract](https://docs.typesafe.ai/models),
[Phala catalog](https://phala.com/models) (checked 18 October 2026).

### Local continuation: encrypted activity and hosted JEV boundary

The encrypted action runner now persists bounded activity snapshots before model
dispatch. The existing activity feed reads them through owner-authorized receipt
APIs. A separate `action-progress` cryptographic purpose prevents an untrusted
broker from substituting a progress snapshot for a completed action result.
Concurrent progress writes serialize; finalized receipts reject later writes.
Progress storage failure prevents the following inference call. These are fixed
stage descriptions, not model-generated reasoning or JEV judgments.

`hosted-jev-port.js` implements the actual OpenRouter native Decisions protocol
directly from the guest, without the ordinary Hub proxy. It pins JEV 1.13 and
TypeSafe, requires ZDR/no-data-collection routing, disables fallback, bounds and
validates requests/results, shares the durable monthly admission lock/ledger,
and retains reservations after unknown outcomes. Its accounting is explicitly
provider-reported (`accounted`), never labeled attested usage. Constructor gates
require an explicit provider-visible boundary and verified native ZDR routing.
This adapter is **not wired into the live worker or adaptive loop**; no new JEV
request was sent, credentials installed, image pushed, or guest started. Native
ZDR behavior and our account's logging settings still require verification before
activation. OpenRouter's live public ZDR endpoint list includes TypeSafe JEV 1.13
and 1.14 (checked 19 October local time). This is affirmative published routing
evidence, not proof of our account settings or a successful native Decisions call.
The public model metadata separately confirms the pinned model identity and price.

Both changes are local only. They need a new measured image, client review and
actual browser/guest acceptance before their runtime behavior can be claimed.
Sources: [Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request),
[OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr),
[JEV endpoint metadata](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints),
[Live ZDR endpoints](https://openrouter.ai/api/v1/endpoints/zdr),
[TypeSafe legal](https://docs.typesafe.ai/legal).

The next browser check found the local SIWE proxy had crashed on an upstream body
timeout: it committed 200 headers, caught the body error, then attempted another
header write. The proxy now reads the body first and guards its error response;
an actual loopback HTTP regression verifies a 503 followed by a healthy request.
The owner-scoped broker/auth services were restarted with workflow processing
paused. Paused restart may reuse only the exact previously verified owner ID and
wallet configuration; each request still requires live Hub session verification.
No authentication timestamp was fabricated or request authorization bypassed.
After restart, actual Chrome displayed the saved basil report and its existing
discussion again; broker logs confirmed live Hub-authenticated reads and the new
idle action-status route returned 200. This verifies saved-state access, not live
progress from the stopped guest. The new proxy regression passes separately from
the 292-test privacy run.

Independent Explore cleanup removed extension promotion from its shared footer.
The extension's automatic fallback injectors now enforce the same first-party
and loopback guard as the injected script, including a navigation recheck.
Thirty extension tests, extension TypeScript/build and frontend TypeScript pass.
The actual localhost Explore page shows no extension promotion or floating tip
control. Chrome's installed Web Store Nibgate extension was already disabled;
the local rebuilt extension has not been published or installed over it.

## Remaining acceptance work

- Broader quality/relevance evaluation and encrypted progress UX: one retrieved Wikipedia result was irrelevant, the report sometimes presents fictional observations as real, and discussion can add unsupported generalizations. Sampled verification is not full factual correctness. Paused processing must preserve saved content; broader restart/lost-response tests remain open.
- Physical second-device recovery and multi-device conflict/recovery tests; passkey PRF and trusted-device pairing are not implemented.
- Explicit reconciliation/retry for failed or uncertain actions, durable settlement, user funding and billing parity.
- Complete adaptive research/tool parity, paid-source unlocking, isolated arbitrary code, and independent client/release governance. Website-delivered JavaScript and browser extensions remain client trust boundaries.
- Independent clean-base reproducibility. The rehearsal image reuses an immutable dependency base whose manifests/lockfile matched, replacing all active source directories before exact image checking.

See [protocol](PROTOCOL.md), [plan](PLAN.md), [architecture](ARCHITECTURE.md) and
[historical checkpoints](../archive/OWNER-REHEARSAL-2026-10-18.md).
