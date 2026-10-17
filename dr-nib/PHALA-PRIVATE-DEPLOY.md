# Dr. Nib private testnet deployment on Phala

This runbook finishes the bounded Dr. Nib private-source integration on the
Nibgate testnet. It covers the isolated Railway broker, restricted synthetic
database, one Phala confidential guest, one capped synthetic inference, and
mandatory cleanup.

It does not authorize mainnet data, customer records, full-mode research, a
persistent CVM, wallets, purchases, or unrestricted paid inference. The
browser release boundary in [PHALA-BOOT-PINS.md](PHALA-BOOT-PINS.md) remains a
separate requirement before private customer material can be released.

## Current verified state — 17 October 2026

- Official Phala CLI v1.1.22 is logged in as `fortunesayspump`, workspace
  `fortuneze0's projects`, profile `nibgate`.
- Railway service `nibgate-drnib-private-synthetic` is online in
  `private-broker-only` mode.
- Broker `/health` returns HTTP 200 with `privateEnabled: false`.
- Ordinary broker routes return 404 and unauthenticated private routes return
  401.
- Isolated database `drnib_private_synthetic` exists and has migrations
  `0001` through `0008`.
- Restricted roles `drnib_private_broker_testnet` and
  `drnib_private_guest_testnet` exist and report passwords set.
- Broker access is limited to `SELECT, INSERT` on `drnib."ResearchRun"`.
- Guest access is limited to the reviewed run, step, report, and budget tables.
- `ResearchRun`, `ResearchStep`, `ResearchReport`, and
  `PrivateAiBudgetReservation` all contained zero rows after the failed boot.
- The failed `nibgate-synth-debug3` CVM was deleted after about 14 minutes.
  The final `phala cvms list` returned no CVMs. Its upper-bound infrastructure
  cost was approximately $0.015.
- No paid inference ran.

## Why the latest guest failed

The first launch used a temporary diagnostic command that imported `jose` from
the workspace root. pnpm exposes it to the backend package instead, so that
command exited before the normal guest process started.

An in-place update removed the diagnostic command. The normal guest then
failed closed because `PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM` was only 26
characters long. That represents the PEM header shape, not a complete Ed25519
SPKI public key. The secret's value was not printed or inspected.

The instance also remained on `dstack-dev-0.5.12`; updates cannot be assumed to
convert an existing development instance into an approved production-OS
instance. Create a fresh CVM for the final test.

Phala CLI v1.1.22 warning: `phala deploy --prepare-only` is not a dry run for a
non-on-chain-KMS CVM. The CLI reported that prepare-only had no effect and
applied the update directly. Do not use it as a safety preview on this path.

## Completion definition

The bounded test is complete only when all of these are true:

1. The full public signing key matches the broker's existing private key.
2. A fresh production-OS CVM boots from the reviewed digest-pinned image.
3. Public logs, system information and TCB information are disabled; SSH and
   debug access are absent; secure time is enabled.
4. Fresh application/session attestation passes official full verification.
5. The broker sees the guest as ready and remains restricted to the one owner.
6. One synthetic source of at most 512 characters causes at most one approved
   model request.
7. The receipt, budget reservation, database writes and total cost are checked.
8. The broker is disabled again, the CVM is deleted within 30 minutes, and a
   second `phala cvms list` returns zero.
9. The evidence record and integration docs are updated with exact immutable
   hashes and observed results.

## Report recovery (durable, still operator-blind)

Private reports no longer die with the tab. The report key and the worker
state key are **client-held**: the browser generates the report HPKE key pair
and HPKE-delivers the worker state key to the measured guest for each session
(`private-worker-key.js`). Recovery therefore never needs a guest, broker or
attestation change — only a way for the same client to rebuild the keys.

Two paths ship in the private UI:

1. **Same device (always on).** The non-extractable report key pair and worker
   state key are stored in the browser's IndexedDB (`dr-nib-private-key-store.ts`)
   keyed by run id. A returning visitor reopens the stored `hpke-report-v2`
   envelope and decrypts it locally with no model call. `CryptoKey` is
   structured-cloneable, so the key material is persisted without ever leaving
   the browser profile; the operator holds only ciphertext.
2. **Cross device (opt-in).** One EIP-712 signature over the run id is
   HKDF-split into the report key and worker state key
   (`dr-nib-private-wallet-key.ts`, `deriveResultKey` via `DeriveKeyPair`).
   `DeriveKeyPair` is deterministic, so re-signing the same typed data on any
   device reproduces the same report public key and the stored envelope decrypts
   directly. No escrow, no wrapped key, no server-side secret.

The broker exposes `GET /v1/private/runs` (`private-broker.js`): a DB-only,
tenant-scoped list of the account's confidential runs returning only
`id`/`createdAt`/`status`/`tenantId` (never ciphertext), so a new device can
discover run ids and then decrypt with the wallet-derived key. This route needs
no guest and works while the guest is asleep.

Because both keys are client-held, the earlier "re-attest and rewrap" design is
unnecessary and intentionally not implemented. Re-attest & rewrap cannot
recover a lost key — the guest cannot open its retained copy without the
client's state key — so it added guest surface without adding recovery. Keep the
guest path fail-closed and unchanged.

Privacy notes: signing a recovery message reveals only the wallet address; the
derived key is never sent anywhere. Wallet recovery depends on the wallet
producing a deterministic signature for the same typed data (true for RFC6979
software wallets); the UI falls back to same-device recovery if the re-derived
public key does not match. Clearing browser storage and losing the wallet
together makes a stored report undecryptable, which is the intended fail-closed
behavior.

## Step 1 — preserve and review the code

Work from the private integration checkout and keep it isolated from the
separate held-tip security fix:

```bash
cd /Users/fortune/Documents/Codex/2026-10-16/task-5/nibgate-integration
git status --short --branch
git diff --check
```

Create a dedicated branch and commit the reviewed privacy work before a public
deployment. Do not reset or absorb unrelated changes.

Run the focused suites and the full privacy suite. The last recorded run passed
217 privacy tests, five broker isolation tests, and five frontend private API
tests; rerun them after any code change.

## Step 2 — supply the existing complete signing public key

The existing public half is available at:

```text
/Users/fortune/.config/nibgate/drnib-worker-auth/public-key.pem
```

It was validated without reading the private key:

- complete three-line SPKI PEM with real line breaks;
- 113 bytes with a final newline;
- OpenSSL identifies it as an Ed25519 public key;
- DER SHA-256 fingerprint:
  `7a735ae6a35b057ed05d5a921617c4c6d5b626de82ca29e826b5b3e5c8d1045f`.

The public key is not secret. The guest now accepts its canonical base64 form
through the single-line Phala encrypted environment field:

```text
PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64
```

`/Users/fortune/Documents/Codex/2026-10-16/task-5/DEPLOY-PHALA-PRIVATE-GUEST.command`
validates the public file and its fingerprint, base64 encodes it without
printing it, and adds it to an owner-only temporary environment file. The
temporary file is removed when the CLI exits. This avoids dotenv corruption of
the PEM's line breaks.

The corresponding private-key file exists beside it with mode 600. It was not
read or printed. Keep the existing broker private-key configuration unchanged.

The signing pair destinations are therefore:

- Railway broker:
  `PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM=<complete existing private key>`
- Phala guest: the base64 encoding of the complete verified public file above.

Requirements:

- Do not generate a second pair.
- Do not paste either key into chat, source control, command arguments or logs.
- The decoded guest value must be the complete `BEGIN PUBLIC KEY` / `END
  PUBLIC KEY` PEM. The guest rejects malformed base64 and incomplete PEM data.
- Do not alter the file, its line breaks or the broker identity.

No new key generation or manual key copying is required.

## Step 3 — confirm the isolated broker stays closed

Before guest creation:

```bash
curl -fsS https://nibgate-drnib-private-synthetic-production.up.railway.app/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://nibgate-drnib-private-synthetic-production.up.railway.app/
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://nibgate-drnib-private-synthetic-production.up.railway.app/v1/private/runs
```

Require respectively:

- HTTP 200, `mode: private-broker-only`, `privateEnabled: false`;
- HTTP 404;
- HTTP 401 without a session cookie.

Keep these disabled:

```text
DRNIB_PRIVATE_ENABLED=false
DRNIB_PRIVATE_WAKE_ENABLED=false
DRNIB_PRIVATE_FULL_ENABLED=false
```

Do not add hub database, Redis, object-storage, wallet, escrow, payment,
retrieval, export or ordinary worker credentials to the broker.

## Step 4 — prepare the guest secrets

Place these in the owner-only source environment file. Never echo their values
during verification:

```text
DRNIB_DATABASE_URL
PRIVATE_AI_API_KEY
DRNIB_PRIVATE_TEST_TENANT_ID
PRIVATE_AI_APPROVED_MODEL=openai/gpt-oss-120b
PRIVATE_ACI_GATEWAY_BASE_URL
PRIVATE_ACI_COMPOSE_HASH
PRIVATE_ACI_SESSION_ID
DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD=50000
DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD=50000
DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M=150000
DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M=600000
PRIVATE_GUEST_IMAGE=<new image reference pinned with @sha256:...>
```

The compose fixes `DRNIB_PRIVATE_FULL_ENABLED` to its fail-closed default and
`PORT` to 3102. The helper supplies
`PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64`; omit both public-key variable names
from the source environment file.

The database URL must use `drnib_private_guest_testnet`, the public Railway
PostgreSQL proxy, database `drnib_private_synthetic`, schema `drnib`, and TLS.
Do not use the administrator connection.

The tenant ID must match the signed-in owner's `user.id` from:

```text
https://testnet.nibgate.xyz/auth/me
```

Do not copy the session cookie.

Do not add either public-key variable to the source environment file. The
deployment helper adds the verified base64 value. Before deployment, check only
presence and structure of the other values:

- local public key fingerprint matches the value recorded in Step 2;
- session ID is exactly 64 lowercase hexadecimal characters;
- compose hash is exactly 64 hexadecimal characters;
- tenant ID matches `[A-Za-z0-9:_-]{1,128}`;
- budget values are positive integers;
- database URL uses PostgreSQL with TLS;
- ACI gateway uses HTTPS.

## Step 5 — deploy a fresh production guest

Use the reviewed compose candidate at the task root:

```text
/Users/fortune/Documents/Codex/2026-10-16/task-5/PHALA-PRIVATE-SOURCE-COMPOSE.candidate.yml
```

It must retain:

- a digest-pinned image built from the revision that accepts
  `PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64`;
- port `3102`;
- `/var/run/dstack.sock:/var/run/dstack.sock:ro`;
- the normal image command with no diagnostic override;
- for the review window only, `DRNIB_PRIVATE_REVIEW_ATTESTATION_ENABLED=true`,
  which exposes the nonsecret, rate-limited, nonce-bound
  `/v1/private/attestation` endpoint in normal mode so Step 7 can fetch the V1
  attestation for this exact instance. Remove it (or set it false) before the
  sustained release. It never exposes private source, keys or jobs.

Create an owner-only environment file containing every setting in Step 4 except
the public key, plus a digest-pinned `PRIVATE_GUEST_IMAGE` value. Set its mode
to 600. Then run:

```bash
/Users/fortune/Documents/Codex/2026-10-16/task-5/DEPLOY-PHALA-PRIVATE-GUEST.command \
  --preflight /absolute/path/to/owner-only-phala.env

/Users/fortune/Documents/Codex/2026-10-16/task-5/DEPLOY-PHALA-PRIVATE-GUEST.command \
  /absolute/path/to/owner-only-phala.env
```

The helper refuses source files that are not regular mode-600 files, refuses a
public-key entry supplied by the source file, validates the expected public-key
fingerprint, injects the key through a temporary mode-600 env file, and invokes
the official CLI with the locked-down flags shown above. Do not include secret
values in command arguments. `--preflight` performs the same local validation
and temporary-file construction without creating a Phala resource.

Immediately record the app ID, creation time, hourly rate and hard deletion
deadline. The deadline is creation plus 30 minutes. Set a persistent local
watchdog or calendar timer; a note in a terminal is not enforcement.

## Step 6 — reject a weak boot

Before sending any source or enabling the broker, fetch nonsecret metadata:

```bash
phala cvms get nibgate-private-guest-testnet --json
phala cvms attestation nibgate-private-guest-testnet
```

Reject and delete the CVM unless all are true:

- status is running;
- OS is not a development image;
- secure time is enabled;
- `public_logs`, `public_sysinfo`, and `public_tcbinfo` are false;
- image digest is the reviewed digest;
- compose has no command override;
- socket mount is read-only;
- no SSH key or debug endpoint is present;
- `/health` returns HTTP 200 with `privateReady: true` and
  `fullReady: false`.

Do not temporarily enable public logs on the final guest. A failed closed boot
should be deleted, corrected offline, and replaced.

## Step 7 — perform fresh full verification

Follow [PHALA-BOOT-PINS.md](PHALA-BOOT-PINS.md) against the exact live instance:

1. Generate a fresh reviewer nonce.
2. Request the guest's V1 attestation for that nonce.
3. Verify report-data binding to the nonce, session ID and ephemeral recipient
   key.
4. Run the pinned official verifier image:
   `ghcr.io/dstack-tee/dstack-verifier:0.6.1@sha256:9f2c07a94efd3d8a1a89268e5faa35e91e3cb345b9c4ab859c86d35142f4f788`.
5. Require quote, event log, OS image and ACPI verification; TDX; `UpToDate`
   TCB; no advisories; approved app, instance, compose, OS and KMS identities.
6. Retain exact evidence and verdict hashes.

The first historical diagnostic had only a valid boot quote; application/session
verification failed because the dstack socket was missing. Only the corrected
second historical diagnostic passed the complete verification chain. Neither
historical result approves a new boot.

## Step 8 — connect the broker

After the exact guest passes Step 7, update the Railway broker directly:

```text
DRNIB_PRIVATE_GUEST_BASE_URL=<verified guest HTTPS origin>
DRNIB_PRIVATE_TEST_TENANT_ID=<same verified owner user.id>
DRNIB_PRIVATE_ENABLED=true
DRNIB_PRIVATE_WAKE_ENABLED=false
DRNIB_PRIVATE_FULL_ENABLED=false
```

Keep the existing private signing key. Redeploy and require broker `/health` to
report private readiness. Verify again that ordinary routes return 404 and an
unauthenticated private route returns 401.

## Step 9 — connect the frontend

Set the testnet frontend's server-side variable:

```text
DRNIB_PRIVATE_API_URL=https://nibgate-drnib-private-synthetic-production.up.railway.app
```

The frontend rewrites `/drnib-private-api/:path*` to that broker, while the
ordinary `/drnib-api` path remains unchanged. Deploy the reviewed frontend and
verify `/dr-nib/private` while signed in. Do not expose the broker private key,
database URL or session cookie to the browser.

A custom hostname such as `private-drnib.testnet.nibgate.xyz` may replace the
Railway URL only after DNS and TLS are verified.

## Step 10 — run one capped synthetic job

Use only the verified owner account and a harmless source no longer than 512
characters.

Before submission, record zero counts in the four isolated tables. Submit one
run and permit one model call with at most 8,192 serialized prompt bytes and
512 output tokens. Do not retry an uncertain request until provider and
database state establish whether it already ran or billed.

After completion, verify without printing private content:

- one expected synthetic run and only its permitted related rows;
- tenant ID matches the owner;
- budget reservation was finalized exactly once;
- model, session and request digest match the signed receipt;
- attestation and receipt verification passed;
- actual AI and VM cost remain below $0.10.

## Step 11 — disable and delete

Immediately set the broker back to:

```text
DRNIB_PRIVATE_ENABLED=false
```

Delete the exact app ID rather than a reused name:

```bash
phala cvms delete app_<exact-app-id> --yes
phala cvms list
```

Wait until the list returns no CVMs. Record the deletion timestamp and final
cost. Do not leave a failed or completed synthetic CVM running overnight.

## Step 12 — publish evidence and docs

Create a dated evidence document containing only nonsecret information:

- source commit and image digest;
- app and instance IDs;
- compose, OS and KMS identities;
- official verifier image digest and verdict hashes;
- route and authorization checks;
- aggregate database row counts;
- model and signed-receipt result;
- creation, deletion, duration and cost;
- final zero-CVM output;
- limitations and production blockers.

Update this file, [DEPLOY.md](DEPLOY.md), [README.md](README.md), and the
fixed-boot policy when the real results differ. Do not advertise the private
path in public agent discovery surfaces until it is actually deployed,
verified, and supported.

## Remaining production boundary

Completing the one synthetic test does not make operator-blind production
research generally available. Production still requires an independently
controlled verifier or independently pinned client release, governed release
rotation, verified negative cases, removal of debug/SSH/operator plaintext
paths, and a complete review of the customer-data lifecycle. Keep the product
fail closed until those controls have evidence.
