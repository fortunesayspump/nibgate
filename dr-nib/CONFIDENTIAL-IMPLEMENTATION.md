# Dr. Nib confidential worker

**Status:** implemented and merged to `main`, **off by default** (opt-in, fail-closed). The privacy unit suite passes 233 tests and a live ACI receipt probe verified the metering binding on `inference.phala.com`. There is **no completed live confidential run yet** and the guest CVM is not currently deployed. Nothing here is a shipped operator-blind guarantee — see "What is and isn't proven".

## The boundary

Sensitive — the supplied source, the model's reading of it, and the report — is processed only inside a measured confidential VM. The topic and intake answers stay on the ordinary backend; that text is not the sensitive part.

| Party | Can see |
|---|---|
| Browser tab | plaintext source, attestation evidence, decrypted report, tab-only keys |
| Nibgate backend | ciphertext envelopes, run metadata, tenant/run IDs, object digests |
| Broker (meter) | ciphertext, receipt-bound usage, budget movement |
| Measured guest | plaintext, in memory, only while running |
| Confidential model endpoint | the prompt the guest sends, under attested routing + ZDR constraints |

## Flow

1. Run + topic/intake are created on the ordinary backend (`POST /v1/runs` still rejects `privacyMode:'confidential'`; a private run is created through the private path).
2. Browser opens a fresh guest session and gets an ephemeral recipient key + attestation evidence + nonce.
3. Browser independently verifies the quote, measured compose hash, workload image and TCB, then challenges the guest to **prove possession** of the ephemeral private key.
4. Browser HPKE-seals the source (P-256 / HKDF-SHA256 / AES-128-GCM) with authenticated data binding tenant/run/object/revision/purpose + recipient-key digest.
5. The guest decrypts, runs source-only `plan → write` (live web and server-side tools off), and calls the confidential model endpoint.
6. The guest returns receipt-bound usage; the broker validates the signed ACI receipt and draws the run budget (see `CONFIDENTIAL-AI-BUDGET.md`).
7. The report is sealed to the browser's result key and decrypted in the tab.

## Code map

- Guard: `backend/src/privacy/guard.js` (`assertConventionalPath` blocks non-legacy runs from the plaintext worker; `assertConfidentialDrawable` gates confidential ledger draws).
- Crypto/intake: `private-repository.js`, `phala-quote.js`, HPKE envelope routes.
- Guest: `phala-ai-port.js` (attaches receipt-bound usage), `private-guest-main.js` (verifies signed usage, seals the report), `private-guest-http.js` (`validJobUsage`).
- Adapter: `phala-aci-adapter.js` — verifies the receipt and requires the response bytes to match the receipt's committed `response.*` body hash. The model and compose hash are pinned; the **serving session is discovered live at job time** (`createAciSessionDiscoverer`), because the gateway rotates sessions in seconds and a boot-time session pin goes stale (`session_not_accepted`).
- Broker + money: `private-broker.js` (strips usage, best-effort draw), `private-broker-money.js`, `private-money-route.js` (HMAC `POST /internal/draw|settle`, mounted at `/v1/private`).

## What is and isn't proven

Proven: ciphertext handling, real local HPKE seal/open + tamper/wrong-recipient rejection, encrypted Prisma-field writes, guard behavior, and a **live** ACI receipt probe showing the response body is hash-committed (`usageAuthenticated: true`) so `usage.cost` is bound to the signature.

Not proven: no full confidential run on hardware has passed end to end; attestation verifies the *environment*, not the *browser* (a Nibgate-controlled mutable client is not yet operator-blind); the Docker base image tag must be pinned to a reviewed digest; disabled SSH/debug/logs, egress policy and code-update governance must be reviewed per release; JEV decision-quality parity is untested.

## Next gates

1. Deploy the guest with the full-execute DB grants; pin the model and compose hash after review (the serving session is discovered per job, not pinned).
2. Independent client pin + key policy so the browser is not silently re-served.
3. Canary sweep across DB, R2, Redis, queues, logs, HTTP before any private mode is turned on.
4. Provider-level hard spend ceiling and stuck-job/uncertain-shutdown recovery.

Deeper design history: `CONFIDENTIAL-DECISIONS.md`, `CONFIDENTIAL-FULL-MIGRATION.md`, `PHALA-PRIVACY-EVALUATION.md`, `PHALA-VERIFIER.md`.
