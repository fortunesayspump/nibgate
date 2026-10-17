# Step 7 — fresh full verification evidence (review-window guest)

**Date:** 2026-10-17
**Scope:** Bounded, owner-only synthetic Private AI test on Phala Cloud testnet.
**Deletion discipline:** the reviewed instance is billable and must be deleted by
**11:40:36Z** (created `11:10:36Z`, 30-minute hard window) unless the owner
explicitly extends it to finish the paid synthetic run.

## Instance under review

| Field | Value |
|---|---|
| CVM name | `nibgate-private-guest-testnet` |
| CVM id | `233107bd-9a21-4f4d-91fe-436fc5d689c4` |
| appId | `70d39b0de8fdca3f5fda2d1897255dfe8ff178e5` |
| instanceId | `70e861abc9a5b11d747243129c4da3d45a54b710` |
| composeHash | `298826d682422b56b06547623d24471eaa7198dabed8a4d3231f448dd77fad9e` |
| osImageHash | `ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6` (dstack 0.6.1, `is_dev=false`) |
| guest image | `docker.io/fortunesayspump/nibgate-private-guest@sha256:c2b526dd8bd3e488c353f61e7d0a62096d610a5a83fcb9d085e5ccf5bd9442e2` |
| node / region | `prod5` / US-WEST-1, `tdx.small` |
| secure time | enabled |
| `public_logs` / `public_sysinfo` / `public_tcbinfo` | `false` / `false` / `false` |
| socket mount | `/var/run/dstack.sock:/var/run/dstack.sock:ro` |
| `/health` | `{"ok":true,"privateReady":true,"fullReady":false}` |

## Review-window attestation endpoint

The production guest intentionally does **not** expose the public diagnostic
quote endpoint. For this review window only, the guest was deployed with the new
opt-in flag **`DRNIB_PRIVATE_REVIEW_ATTESTATION_ENABLED=true`**, which exposes the
nonsecret, rate-limited, nonce-bound `GET /v1/private/attestation?nonce=<64hex>`
in normal mode so a reviewer can run the pinned full verifier against the exact
instance. The flag must be removed (or set false) for the sustained release; it
never exposes private source, keys or jobs.

A fresh reviewer nonce was generated with `openssl rand -hex 32`. The response
was `{"diagnostic":true, ...}` with `clientNonce` equal to the reviewer nonce and
`evidence.attestation` (dstack V1 MessagePack, 12915 bytes) from `/v1/Attest`.

## Full dstack verifier (pinned image)

```
ghcr.io/dstack-tee/dstack-verifier:0.6.1@sha256:9f2c07a94efd3d8a1a89268e5faa35e91e3cb345b9c4ab859c86d35142f4f788
--config /etc/dstack/dstack-verifier.toml --verify /review/attest.json
```

Verdict (`is_valid: true`, `reason: null`):

- `quote_verified` = true
- `event_log_verified` = true
- `os_image_hash_verified` = true
- `acpi_tables_verified` = true
- `tee_variant` = `dstack-tdx`
- `tcb_status` = `UpToDate`, `advisory_ids` = `[]`
- `app_info.app_id` / `compose_hash` / `instance_id` / `os_image_hash` all match the instance above
- `key_provider` = `kms`, id = the verified KMS identity captured in the policy

## report_data binding

The verifier's `report_data` equals the independently computed
`drnib-phala-session-v2` binding over the reviewer nonce, the response session
UUID and the response ephemeral P-256 recipient key (trailing 32 zero bytes):

```
5396a7bcc592a04adad69a09d65f1db2111323ea5a06f5b90ee37d06f8bad3230000000000000000000000000000000000000000000000000000000000000000
```

## Reviewed-boot candidate (candidate-requires-independent-review)

Built by `frontend/scripts/build-reviewed-boot-candidate.mjs` (which re-runs
official production QVL over the exact quote extracted from the same V1 evidence
and compares against the verdict + independent policy).

- `status`: `candidate-requires-independent-review`
- `reviewedSha256Hex` (SHA-256 of the exact UTF-8 manifest JSON bytes):
  `9996179af20310d0d436584cb15cc97db65c61f1d1258caa6a32d14cdd36a243`
- QVL-derived hardware measurements (lowercase hex):

| MR | Value |
|---|---|
| mrTd | `2a674327c50218dba880066b349b8d559d749ed68dce33fd651c184a877d084b07a9e583767a7ad5da13ed91deec2b70` |
| mrConfigId | `034421194d8819bad22c0dcd69f476c03246ce52edece6cd02d0b397a50ffbdd69000000000000000000000000000000` |
| mrOwner | `000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000` |
| mrOwnerConfig | `000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000` |
| rtMr0 | `68102e7b524af310f7b7d426ce75481e36c40f5d513a9009c046e9d37e31551f0134d954b496a3357fd61d03f07ffe96` |
| rtMr1 | `89ef86c5125b986c325f0a94acfa87718a4ef3a4d4f237dbb72dda3cf777fd2c054555fb4407eb53338d7d67329a7333` |
| rtMr2 | `e9000e338f33233e8f51b7fd031e1c158bdcf8572eab041c0bc8eb7fef48b23259a6a556e6c8e2af99999fc39c793179` |
| rtMr3 | `ea377fb6670014c5ac40226bf6f72cf193f577becf7f1d872e5e72a8026db8f59767a9ecc2256b5d4384bc125bb6c589` |
| tdAttributes | `0000001000000000` |
| xfam | `0702000000000000` |

## Artifact hashes (retained under `review/`)

| Artifact | SHA-256 |
|---|---|
| `session.json` (reviewer V1 response) | `7f1971156d022fa0177b22c7d7eb91abc118caa2eb129525304ff7e90123ceea` |
| `candidate.json` audit.verifiedEvidenceSha256 | `ff1bf5da9c9717ca767c94350d43c388a184419ae12571c6cde8c35848c3266c` |
| `verdict.json` (full verifier) | `f99097bb0588fc0ff61f2d1e063c697d6b03672a226ccd99b4d775825d1ce157` |
| `approved-policy.json` (reviewer policy) | `95fd5b65bb6a959702323cb1ee7cd29737fa0b764ac7fc913aaa87037ddbe70b` |

## Open review items (owner sign-off required)

The five `reviewedReleaseControls` were set true under the owner directive to
produce this **candidate**. Two facts a reviewer must consciously accept:

1. **`os_image_is_dev` is `null`** (modern TDX lite). Approval of the production OS
   rests on the independently reviewed dstack 0.6.1 OS image hash
   `ec43cb8c…`, not on a non-dev flag.
2. **`imagesDigestPinned`** holds for the deployed container (compose references
   `PRIVATE_GUEST_IMAGE` by digest), but the Dockerfile base image
   (`node:22.22.0-bookworm-slim`) is pinned by tag, not by digest. Pin the base
   digest before treating this control as fully satisfied.

This artifact is a **candidate**; it is not an approval.

## Restart / upgrade

RTMR3 encodes the instance id and launch events. A new deployment, reboot or
runtime RTMR3 extension changes these pins and **must fail closed** until this
exact review is repeated for the new instance.
