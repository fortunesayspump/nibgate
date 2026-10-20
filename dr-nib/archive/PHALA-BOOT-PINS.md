# Browser-local Phala verification for a reviewed, fixed CVM boot

This is a **bounded fixed-boot demonstration path**, not an automatic on-demand production policy. No real Phala measurements or approval manifest are committed to this repository. The private client must reject missing, expired or mismatching pins. Synthetic tests are not hardware validation.

## Trust model

The user runs a locally obtained, independently reviewed and hash-pinned client build. The release reviewer controls the build input and independently validates one real Phala CVM instance with the official full `dstack-verifier`. The reviewed boot manifest and SHA-256 of its exact UTF-8 JSON bytes are compiled into that pinned client build. Nibgate, the Phala guest and an ordinary mutable Nibgate-hosted web page cannot choose or update either value. No new signing credential is needed for this fixed-boot path. A future remotely updated manifest would require an independently pinned signing key; the optional Ed25519 adapter branch is unused in this demo.

On each private session, the browser extracts the **exact raw quote within the same dstack V1 MessagePack attestation** it received. `@phala/dcap-qvl@0.6.5` verifies the Intel production DCAP signature chain, CRLs, collateral expiry and TCB with the browser clock. Policy requires `UpToDate`, zero advisories, TDX, a non-debug quote, exact reviewed MRTD/MR_CONFIG_ID/MR_OWNER/MR_OWNER_CONFIG/RTMR0–3/TD attributes/XFAM, and fresh 64-byte `report_data` bound to the client nonce, session ID and ephemeral P-256 key. The existing live HPKE challenge then proves possession of that key before the browser encrypts source material. If any check, PCCS request, CORS permission, or key-possession step fails, the browser does not release a private source.

The quote alone does **not** tell a browser what the OS image, compose, app ID or KMS identity mean. The offline full-verifier review establishes those properties **for the exact pinned measurement set**. Exact matching of a new hardware-signed measurement set to that independently approved set preserves the decision for this fixed boot, subject to the reviewed app's behavior. Collision resistance and an honest, correctly configured reviewer/verifier are trust assumptions. An operator can still deny service; this does not protect a client whose own pinned build is replaced. The browser trusts Intel's root, the selected audited QVL build, its clock, and the PCCS for availability, while QVL cryptographically validates PCCS-provided collateral. This does not use a Nibgate-proxied verifier verdict as authority.

## How to prepare the reviewed pins

### Reviewer workstation: exact dstack 0.6.1 verification

This is the runnable Mac path for an **actual Phala guest running dstack 0.6.0+**. A credential-free diagnostic guest passed fresh V1, QVL, and full-verifier checks on 2026-10-16 and was deleted; that one boot does not authorize future boots or private source release. Work in a clean, reviewer-controlled checkout. Docker Desktop on Apple Silicon will emulate the official x86_64 verifier image. The image is the [official 0.6.1 security release](https://github.com/Dstack-TEE/dstack/releases/tag/verifier-v0.6.1); its immutable digest below is also hard-pinned in the candidate generator. The [official one-shot CLI](https://github.com/Dstack-TEE/dstack/blob/v0.6.1/dstack/verifier/src/main.rs) writes a JSON result beside the input as `<input>.verification.json`; retain and validate that file, rather than treating stdout as the verdict. Docker and a network route to Intel/Phala DCAP collateral are prerequisites; no service needs to be deployed.

```bash
set -euo pipefail
mkdir -p review
# Set GUEST_URL to the actual HTTPS origin of the reviewed Phala guest.
# This diagnostic request contains no private source or credentials.
openssl rand -hex 32 > review/nonce.hex
NONCE=$(cat review/nonce.hex)
curl -fsS "$GUEST_URL/v1/private/attestation?nonce=$NONCE" > review/session.json
# The response must contain evidence.attestation from /v1/Attest.
jq -e --arg nonce "$NONCE" '.diagnostic == true and .clientNonce == $nonce' review/session.json
node --input-type=module <<'NODE' > review/expected-report-data.hex
import {readFileSync} from 'node:fs';
import {phalaSessionReportData} from './dr-nib/backend/src/privacy/phala-verifier.js';
const session=JSON.parse(readFileSync('review/session.json','utf8'));
const nonce=readFileSync('review/nonce.hex','utf8').trim();
const digest=phalaSessionReportData({clientNonce:Buffer.from(nonce,'hex'),
  sessionId:session.sessionId,
  recipientPublicKey:Buffer.from(session.recipientPublicKey,'base64')});
console.log(Buffer.concat([digest,Buffer.alloc(32)]).toString('hex'));
NODE
jq -e '{attestation: .evidence.attestation} | select(.attestation | type == "string")' \
  review/session.json > review/attest.json
# Copy only public evidence. This also works when a Docker VM cannot bind
# the workstation /tmp directory; never mount guest.env or a secrets folder.
DRNIB_REVIEW_CONTAINER="drnib-review-verifier-$(date +%s)"
docker create --name "$DRNIB_REVIEW_CONTAINER" --platform linux/amd64 \
  ghcr.io/dstack-tee/dstack-verifier:0.6.1@sha256:9f2c07a94efd3d8a1a89268e5faa35e91e3cb345b9c4ab859c86d35142f4f788 \
  --config /etc/dstack/dstack-verifier.toml --verify /tmp/attest.json
docker cp review/attest.json "$DRNIB_REVIEW_CONTAINER":/tmp/attest.json
docker start -a "$DRNIB_REVIEW_CONTAINER" > review/verifier.log 2> review/verifier.err
docker cp "$DRNIB_REVIEW_CONTAINER":/tmp/attest.json.verification.json review/verdict.json
docker rm "$DRNIB_REVIEW_CONTAINER"
jq -e '.is_valid == true' review/verdict.json
```

The container's default config uses production attestation roots/PCCS. For legacy full-image TDX it downloads the OS image from `https://download.dstack.org/os-images/mr_{OS_IMAGE_HASH}.tar.gz`, checks its checksum manifest, rebuilds boot measurements, and compares them with the signed quote. For TDX lite it checks the attestation's `sha256sum.txt` and `measurement.tdx.cbor` against the quote without downloading an archive. The verifier checks the binding of those inputs but cannot decide for you whether the measured OS and container images are **approved for private records**. Independently review the [dstack OS release and measurement artifacts](https://github.com/Dstack-TEE/dstack/blob/v0.6.1/docs/security/security-model.md), exact app source/compose and digest-pinned containers, KMS identity, and debug/SSH/logging posture. The actual Phala OS image may differ from the example 0.6.1 OS image; never copy a release example hash into policy.

The verdict's `is_valid` **does not enforce TCB policy**. Require `quote_verified`, `event_log_verified`, `os_image_hash_verified`, `acpi_tables_verified`, `UpToDate` TCB, no advisories, and independently approved app/instance/compose/OS/KMS identities. TDX lite can legitimately return `os_image_is_dev: null`; the production-image decision then must come from independently reviewed image artifacts. All release-control booleans require human inspection, never a guest or verifier assertion alone.

To make a *candidate* manifest after the full review, create `review/approved-policy.json` with exactly these independently checked fields: `appId`, `instanceId` (40 hex each); `composeHash`, `osHash` (64 hex each); `kmsId` (the actual even-length hex KMS ID); `expectedReportData` (64-byte hex, locally computed from your own 32-byte nonce, response session UUID, and response P-256 recipient public key using the documented `drnib-phala-session-v2` binding, with a zero-filled trailing 32 bytes); `expiresAtMs` (Unix milliseconds, no more than 24 hours from issuance); `verifierImageDigest` (the exact 0.6.1 digest above); and `reviewedReleaseControls` containing all five booleans `productionOsImage`, `sshDisabled`, `debugDisabled`, `plaintextLogsDisabled`, and `imagesDigestPinned`, true only when independently established. The candidate helper separately recomputes `expectedReportData` from `review/nonce.hex` and `review/session.json` and rejects mismatches. Do not source any approved field from the guest's own claims. Then run with the locked frontend dependencies:

```bash
node frontend/scripts/build-reviewed-boot-candidate.mjs \
  --session-json review/session.json \
  --nonce-file review/nonce.hex \
  --attestation-json review/attest.json \
  --verdict review/verdict.json \
  --policy review/approved-policy.json > review/candidate.json
jq -e '.status == "candidate-requires-independent-review"' review/candidate.json
```

The helper extracts the quote from the *same* V1 evidence, runs official production `@phala/dcap-qvl`, checks QVL TCB and signed report-data against the full-verifier verdict and independent policy, and records QVL's hardware-signed measurements as candidate pins. The pinned 0.6.1 verifier **does not return individual MRTD/RTMR fields** in `details.app_info`; its OS/event/ACPI flags describe its checks against the same attestation. The helper emits the exact manifest bytes as `payloadBase64` plus `reviewedSha256Hex`. Its synthetic policy tests are not hardware proof. **The helper cannot authenticate the origin of the saved verdict JSON.** The reviewer must personally run or supervise the pinned verifier command on a controlled Mac, retain the exact input, command, immutable image digest, stdout, exit status and output hashes, and check that no other process replaced the verdict file. `audit.verifierImageDigest` is an asserted audit label, not cryptographic proof that the named image generated the verdict. A human must still review that input-to-output provenance, evidence, policy, pinned image/source artifacts, and candidate before embedding the decoded exact manifest JSON and its digest into a separately pinned local browser build. A restart, changed RTMR3, expiry, or changed release requires another full review.

1. Review a specific source commit, digest-pinned container images, production dstack OS image and its signed/checksummed image measurement artifacts, app-compose, KMS identity and KMS attestation. Independently inspect that SSH, application debug endpoints, plaintext stdout/stderr/tracing and operator-readable logs are disabled. Retain the immutable image digests and review notes. Do not set the five release-control flags merely because the guest claims them.
2. Start the actual Phala CVM. Its reviewed Docker Compose must bind `/var/run/dstack.sock:/var/run/dstack.sock:ro` into the guest container; [dstack's socket API guide](https://github.com/Dstack-TEE/dstack/blob/v0.6.1/sdk/curl/api.md) requires an explicit volume mount. Confirm the container's runtime user can connect to the mounted socket. Request a fresh **`/v1/Attest`** evidence object using a reviewer-generated challenge. The published `@phala/dstack-sdk@0.5.8` `attest()` method calls the frozen unversioned `/Attest` and returns legacy SCALE, which is **not** the V1 MessagePack format required here. The guest must explicitly call `/v1/Attest` on `/var/run/dstack.sock`, or use a separately verified v1 SDK, and fail closed if unavailable. Run the official full `dstack-verifier` of a pinned, reviewed source revision and immutable image against the **exact attestation bytes** on a reviewer-controlled machine or independently operated endpoint. Accept only a valid TDX quote, verified RTMR3 event-log replay, verified OS image hash and boot reconstruction, verified ACPI tables, `UpToDate` TCB and no advisories. Confirm the approved app ID, this instance ID, compose hash, OS hash and exact KMS identity in its verdict. Production OS image review is mandatory when modern TDX lite returns `os_image_is_dev: null`; `null` is not a production assertion. Never use guest `Info`, Trust Center UI text, or a quote-only Phala API in place of full verification.
3. Decode **that same attestation** as dstack V1 MessagePack, take its `platform.data.quote`, and verify it with the official QVL. Record the actual signed `mrTd`, `mrConfigId`, `mrOwner`, `mrOwnerConfig`, `rtMr0`–`rtMr3`, `tdAttributes`, and `xfam` byte strings as lowercase hex. Compare the quote's report data with the review challenge. The dstack V1 document says this field is the exact quote used by the full verifier. Do not substitute an unrelated `GetQuote` response.
4. Create one `drnib-phala-reviewed-boot-v1` manifest with the verified `appId` and `instanceId` (40 hex each), `composeHash` and `osHash` (64 hex each), actual `kmsId` (nonempty even-length hex), all ten measurements, and five review-control fields set to true only after the source/configuration review. Include `audit.verifierImageDigest` (`sha256:` plus 64 hex), `audit.verifiedEvidenceSha256` (SHA-256 of exact attestation bytes), and `audit.verdictSha256` (SHA-256 of the complete saved verifier JSON bytes). Keep the full evidence, verdict, OS measurement materials, source and image digests in the release audit record. Set integer `issuedAtMs` and `expiresAtMs` in Unix milliseconds, with a maximum 24-hour interval. The schema is strictly validated in `frontend/src/lib/dr-nib-private-qvl.ts`.
5. Compute SHA-256 over the **exact UTF-8 manifest JSON bytes**, not re-serialized JSON. Embed both those exact JSON bytes and the reviewed SHA-256 in a local client build independently of Nibgate. Pin and verify the resulting client artifact before running it. The browser checks the embedded hash and expiry. Neither the manifest nor hash may be fetched from the Phala guest, a Nibgate API, or mutable remote UI settings. No sample measurement values are provided here because every value must come from the verified real deployment.
6. Exercise actual hardware positive and negative cases before using private records: corrupt quote, stale/revoked/out-of-date TCB, mismatched each MR, changed nonce/session/key, altered manifest/hash, expired manifest, failed PCCS/CORS, invalid HPKE proof and replay. Keep a stop switch that blocks all private source release. Synthetic unit tests only prove malformed-data and policy behavior.

## Restart and upgrade policy

dstack measures `instance-id` and application launch events into RTMR3; runtime events can also extend that register. A new on-demand instance, reboot or runtime extension may produce a different RTMR3 even with the same code. A mismatch **must fail closed**. The client never learns a new pin from a guest or auto-approves the first quote it sees. Repeat the exact full-verifier, source/configuration and manifest review for the new instance, then deliberately issue a new pinned local client build. This manual policy deliberately trades on-demand continuity for a narrow, understandable fixed-boot demo. An automatic future product requires an independently governed verifier or a carefully designed signed release-controller process with a trust root the Nibgate operator cannot replace.

Official sources: [dstack V1 evidence and quote extraction](https://github.com/Dstack-TEE/dstack/blob/next/docs/guest-api-v1.md#extracting-a-quote-from-an-attestation), [dstack security model and OS measurement checks](https://github.com/Dstack-TEE/dstack/blob/next/docs/security/security-model.md), [full verifier response schema](https://github.com/Dstack-TEE/dstack/blob/next/dstack/verifier/src/types.rs), [Phala QVL JS API and browser requirements](https://github.com/Phala-Network/dcap-qvl/tree/master/dcap-qvl-js).
