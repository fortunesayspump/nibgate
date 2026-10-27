# Guest planning broker protocol and rollout

Implementation is default-off. No production migration or deployment is part of this patch.

## Operator prerequisites

1. Review and deploy the measured worker release containing anonymous planning enforcement and `guestPlanningReady` health support. Update the existing attestation policy through its normal reviewed process; never relax verification to enable guests.
2. Apply `20261027162000_guest_planning` to the Dr. Nib database (not the Hub database) in a reviewed maintenance window, as one transaction after inspecting existing migration history. If the outcome is uncertain, inspect the tables/history before retrying; do not blindly replay raw SQL. Regenerate its Prisma client.
3. Require the existing authenticated private rollout (`DRNIB_PRIVATE_ACCESS_MODE=authenticated`), records/workflow support and existing capability signing configuration.
4. Explicitly set `DRNIB_GUEST_PLANNING_ENABLED=true` in broker and worker, and `DRNIB_GUEST_WORKER_REVIEWED=true` in the broker only after step1. Review the following server ceilings; do not use the flags as a substitute for attestation.
5. Review `CORS_ORIGIN` against the exact browser origins. Mutating guest requests require a matching Origin and JSON; cross-site requests are rejected.

Defaults: 2-hour inference lifetime, 16 actions, 3 replans, $0.10 maximum reserved/committed inference per guest; 100 new sessions/day and 3/hour per socket peer. Issuance limits are transactional, shared across broker processes. `DRNIB_GUEST_MAX_COST_MICRO_USD` may lower the $0.10 ceiling; `DRNIB_GUEST_MAX_SESSIONS_PER_DAY` and `DRNIB_GUEST_MAX_SESSIONS_PER_IP_HOUR` are bounded to1000/day and10/hour. The existing model global monthly cutoff remains in force. No raw network address is persisted.

The guest limiter defaults to the socket peer rather than Express's globally trusted `X-Forwarded-For`. Behind a shared proxy this is conservatively a shared ingress limit, not per-browser IP. For a reviewed ingress that strips/appends forwarding headers correctly, `DRNIB_GUEST_TRUSTED_PROXY_IPS` may list up to16 exact proxy IP addresses (no wildcard/CIDR). Only a transport peer in that list permits a bounded16-hop forwarding chain; scanning stops at the first untrusted address from the transport side. Invalid/oversized chains fall back to the socket peer. Verify the full ingress chain and header handling before rollout; do not enable blanket req.ip or arbitrary XFF trust.

A sleeping worker can be advertised as wakeable only with the explicit reviewed-release flag and configured existing wake controller. Availability checks never start compute. An awake non-wake deployment must report private/workflow/guest readiness. The browser still verifies the exact reviewed worker and key possession before sending content. An old/disabled worker rejects guest capabilities; no ordinary inference fallback exists.

## Routes

All routes below are relative to `/v1/guest-planning` at the existing private broker. Frontend proxy: `/drnib-private-api/v1/guest-planning`.

- `GET /capabilities`: readiness and public limits, no auth or wake.
- `POST /session {}`: issues `{token,sessionId,tenantId,runId,vaultId,expiresAt,limits}`. Token is a random256-bit bearer secret; only its SHA256 hash is stored on the broker. Browser must encrypt it in durable local storage, not URL/localStorage/logs.
- All remaining endpoints require `Authorization: Bearer <token>`.
- `POST /bootstrap {vaultRecoveryEnvelope,projectKeysEnvelope,manifestId,manifestEnvelope}`: validates guest-bound AAD and atomically creates exactly the preassigned guest run/vault. Exact replay is idempotent. Changed ciphertext cannot overwrite a run.
- Read-only `/identity`, `/vault`, `/runs/<ownedRun>/objects[/<id>]`, `/runs/<ownedRun>/actions[/<requestId>]` reuse existing ciphertext record handlers.
- `/runs/<ownedRun>/wake` GET/POST and `/sessions`, `/sessions/<id>/prove`, `/sessions/<id>/action` POST reuse the same signed broker/Phala transport. Execute/full-execute, uploads, generic vault/object mutations, public tools and funding are not exposed.
- `POST /adoption/prepare {adoptionId}`: account session cookie **and** guest bearer required. Freezes quiescent source under its run lock; unresolved inference blocks adoption. Returns frozen manifest digest/revision, targetRunId and trusted worker plan proof. Repeat same account/ID returns prepared state or committed target; another account/ID conflicts.
- `POST /adoption/commit {adoptionId,id,vaultId,expectedVaultRevision,manifestId,manifestEnvelope,projectKeysEnvelope}`: requires fresh account-context envelopes. Checks source freeze/digest/revision and account vault revision in one transaction. Creates fresh target, marks source adopted, records durable result. No ciphertext ownership change and no funding authorization copied.
- `POST /adoption/cancel {adoptionId}`: same authenticated claimant may unfreeze an uncommitted preparation; caller clears staged adoption state only after confirmed response.

Expired inference capabilities can still read and save already completed ciphertext. Unclaimed ciphertext is purged opportunistically after seven days past expiry (on subsequent issuance), retaining opaque accounting records. Guests cannot infer after expiry, freeze or adoption. Local browser encrypted drafts may outlive server retention; they are not promised cross-device recovery.

Planned adoption copies trusted public status/budget and worker plan proof, then requires account `validate-plan` before escrow. That action checks decrypted plan/input digests and current quote without inference; it cannot silently replan, fund or run. Intake-stage adoption remains intake and follows normal authenticated planning.

## Verification limits

Unit tests use an explicitly synthetic transaction store to exercise quota rollback and serialized claims, and HTTP tests use local Express only. Prisma generation succeeds. `scripts/test-drnib-guest-postgres.mjs` has passed on an isolated PostgreSQL17.11 cluster:17 historical SQL migrations plus the guest migration applied transactionally; actual concurrent issuance/quota rollback, bootstrap, cross-account claim, idempotent commit and vault-generation CAS were verified. The harness creates and removes its own loopback-only cluster and never uses a supplied database URL. No production sessions, models, wallets or payments are exercised.


### Real local PostgreSQL regression

With reviewed PostgreSQL binaries installed locally (no running database required):

```sh
NIBGATE_POSTGRES_BIN=/usr/lib/postgresql/17/bin node scripts/test-drnib-guest-postgres.mjs
```

For an extracted official package, `NIBGATE_POSTGRES_SHARE` and `NIBGATE_POSTGRES_LIB` may specify its share and library directories. The harness ignores inherited PostgreSQL connection/service variables, overrides application database URLs with its own disposable URL, verifies server data_directory, applies actual migrations in transactions and stops/removes the fixture in finally. It does not reset or migrate an existing database and never invokes live models or payment APIs.
