# Wake, idle and activity acceptance — 20 October 2026

Local candidate, no Git push or public deployment. The dedicated unchanged Phala
test guest was started only for the lifecycle benchmark, then confirmed stopped.
The candidate broker/guest source still needs its reviewed release and canary
configuration. This is bounded lifecycle/recovery evidence, not general-user
production capacity or a long-duration production soak.

## Implemented

- PostgreSQL row-locked lifecycle state, durable operation tokens/generations,
  request leases, start/stop quarantine and cumulative runtime accounting.
  Provider/network calls occur outside database transactions.
- Shared start admission across replicas; bounded queued requests (64 default)
  and active HTTP dispatch slots (4 default). Current live wiring is one
  configured owner/CVM, not a production multi-tenant pool scheduler.
- UTC-safe background execution-lease counts prevent idle shutdown after an
  asynchronous HTTP response. These counts conservatively include the owner's
  active guest work as well as active dispatch holds.
- Idle drain excludes assignment; a failed graceful shutdown can fall back to a
  confirmed force-stop after draining. Unknown stop outcomes remain quarantined.
  Expired controller intents and unexpected out-of-band starts are reconciled.
- Independent watchdog entrypoint `phala-wake-watchdog.js`; broker replicas also
  run reconciliation ticks. Launching independent process supervision remains a
  deployment step, not proof of a provider-enforced hard spending cap.
- Explicit authenticated POST wake plus no-wake GET status. Client waits for
  startup before opening a fresh verified session. Saved record/action reads
  do not wake compute or reset idle time. Paused workflow rejects a new wake.
- Official SDK transport adapter handles nullable non-security progress fields
  and the SDK's unbound watch helper mismatch. It polls and separately confirms
  state. Only a definite provider 409 start rejection gets bounded retry;
  unknown start transport outcomes are not blindly replayed.

Migration: `0016_private_worker_lifecycle`. Prisma schema includes the table.
Broker/watchdog require SELECT/INSERT/UPDATE on their lifecycle table and
SELECT on the existing run owner and action-lease metadata. Do not grant these
ordinary services document keys, raw plaintext or keeper credentials. Configure
both processes with the same CVM, owner, release and runtime policy. Policy/owner
mismatch fails closed rather than resetting runtime on process restart. The
runtime window needs an explicitly reviewed renewal; it is not reset per request.

## Isolated software tests

Final run: 404 Node privacy/client checks and 72 disposable local PostgreSQL
workflow/lifecycle tests pass; TypeScript and diff checks pass. PostgreSQL tests
never use configured development/customer databases, real model or payment ports.

- 128-request burst across eight independent controller objects backed by real
  local PostgreSQL: one provider start and one idle stop, 128 completed dispatches.
- Final 60-second sustained loop: 9,300 synthetic dispatches across eight
  controllers, one start/stop, no remaining request holds.
- A child controller is actually SIGKILLed after admission/dispatch; an independent
  controller observes lease expiry and safely stops without redispatching work.
- Background action leases, stale intents, cross-owner/policy rejection, capacity,
  active runtime exhaustion, failed stop quarantine, request-during-drain and
  unexpected late starts are covered by SQL and/or focused controller tests.
- Existing funded checkpoint/billing regressions still pass: no blind replay of
  uncertain model/payment work, durable receipts and preserved escrow.

Synthetic provider dispatch throughput is not Phala model throughput, paid-tool
capacity or a production p95. The one-minute soak does not prove hour/day
stability. Source/client changes after earlier runs were rechecked; no claim of
full production stress testing follows from these numbers.

## Real Phala measurement

Same-image stopped CPU CVM `cvm_YKRNRmKa`, image
`a13e31d62b6cd99cc937ff97bb17d3c222806c7926712ab4e137b853504c8a4a`.
One complete accepted cycle on the corrected SDK path:

| Boundary | Measured time |
| --- | --- |
| Start request → provider running | 13.293 seconds |
| Start request → app healthy | 56.926 seconds |
| Request → independent full verification and live recipient-key possession | 79.292 seconds |
| Subsequent warm request, including local full verification and possession proof | 13.126 seconds |
| Final warm request → confirmed automatic stopped state | 43.109 seconds |

The test idle grace was 15 seconds; production recommendation remains five
minutes. Stop duration includes the idle grace and provider shutdown. This is
one accepted cycle, not p50/p95 or a promised SLA. Earlier attempts exposed an
SDK nullable-field error, a known 409 immediately after shutdown and an uncertain
graceful stop; these informed the fixes and are not counted as successful cycles.

The independent pinned dstack verifier ran locally in Docker, so its cost/latency
is included here and does not measure a future hosted independent verifier.
There were zero model calls, zero payment calls and no project-key delivery.
Only public quote evidence and random HPKE challenge bytes were used. The browser's
fixed-boot allowlist was not silently updated; general on-demand browser key release
still needs the existing independent-online-verifier mode configured and accepted.
Do not weaken fixed-boot measurements to make a new boot pass.

The final controller emitted provider-stopped at 10:36:25 UTC, before the separate
cost guard's 10:36:29 UTC deadline. The guard's redundant stop also succeeded.
Provider stop was independently confirmed. AI ceiling remained $0.65,
infrastructure $1.40 ($2.05 combined). The carried conservative infrastructure
bound was $1.385750, not an invoice. No reservation was released as billed usage.

## Conversational activity change

Model proposal summaries now explain recent findings and the next check directly
in encrypted chat. Even the bounded final report step performs a source-grounded
review, showing findings and operational gaps before writing. These summaries
still use checkpointed, admitted inference and count toward the same budget;
they are not free hidden calls or hidden chain-of-thought transcripts.

Private writing instructions put retrieval failures, unavailable full text,
skipped work and creator-discovery process notes in activity, while retaining
material scientific/evidence limitations in the report. The original base
research prompt and final factual verification remain in place. These are prompt
and orchestration changes, not a guarantee that every future model obeys perfectly.
The browser renders model summaries as normal Dr. Nib messages rather than
italic system notes, preserving per-call usage rows and cumulative receipts.

Node and encrypted PostgreSQL integration tests cover final-step summaries,
writing policy, source grounding, unchanged budget admission and strict citation
recovery. The local browser styling was observed on saved events. The narration
image was subsequently packaged (375 hashes, 21 layers), deployed and independently
reviewed. Two fresh real-model intakes failed at upstream/session admission,
so fresh narration/report acceptance remains blocked. The guest is stopped; see
STATUS.md for run IDs and unresolved reservations. Existing saved reports were
not silently rewritten.

## Next canary prerequisites

1. Resolve confidential model-serving and verifiable refusal/usage reconciliation,
   then pass the fresh narration/report test. Migrate/provision the lifecycle store
   and run broker plus independent watchdog with scoped credentials.
2. Configure an independently trusted full verifier and fresh-boot client release
   policy. The fixed-boot localhost demonstration alone is insufficient.
3. Configure the canary's explicit owner/capacity/runtime window, five-minute idle
   grace and provider/operator spending controls. Current key recovery is client-
   assisted; offline unattended restart needs a separate reviewed design.
4. Verify actual deployed browser wake → verification → key delivery → funded
   action → safe idle stop, physical-device recovery and Google/wallet behavior.
   General-user provisioning, legacy plaintext handling and broad rollout remain
   separate from this restricted canary.

Evidence logs: `/tmp/drnib-lifecycle-and-narration-privacy-final.log`,
`/tmp/drnib-lifecycle-and-narration-postgres-final.log`,
`/tmp/drnib-lifecycle-real-wake-results.json`,
`/tmp/drnib-lifecycle-real-wake-accepted.log`,
`/tmp/drnib-lifecycle-final-stopped.json`,
`/tmp/drnib-agent-chat-style-20261020.png`.
