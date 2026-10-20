# ACI gateway rotation review — 19 October 2026

Scope: replace the previously reviewed gateway measurement for the existing
owner-restricted local preview. This does not approve a production frontend or
change the hosted JEV disclosure. No Git push was performed.

Previous gateway compose: `170fb20d504cf0367ddd112d7585e08561d106dc022354c875812738fda041a7`.
Reviewed replacement: `4dbdcd4f17786388a5c35d3847894f9f216c1e3a48331a435398808e1593587d`.

The mismatch was reproduced by an identity-only SDK connection; no inference
request or payment was sent. The replacement was reviewed before rotating the
local policy, rather than accepting a hash simply because the server supplied it.

## Source and executable launch policy

- The measured compose names the official [gateway source commit
  `4ba31eb`](https://github.com/Dstack-TEE/private-ai-gateway/commit/4ba31eb5af1910b3121161d5cf4a0a9886ca0a01).
  Its public `deploy/compose.yaml` is a deployment template, not an exact copy of
  the live operator configuration. The complete observed compose was reviewed.
- The launcher is digest-pinned to
  `ghcr.io/redpill-ai/private-ai-launcher@sha256:c083ff9e6a5ddf10f6c9e9bb1f74cc618deebecfea5208b563c574399db4637c`.
  Its actual image-layer entrypoint and supervisor files match the public
  [launcher source](https://github.com/redpill-ai/private-ai-launcher/tree/a64f4d48ef992bf01649a5538f8d95a0b0f31a08).
  Their SHA-256 values are `dbc1f94a392afd9245ef1cc4f4663927fb020dc9373d427c1088aed1350165fd`
  and `72e73b1355a2774151caf03eb4f6f4ebffba0b4983ea30d54e0022e299307075`.
  The launcher checks out the literal commit, verifies HEAD and builds with
  `cargo --release --locked` and `uv sync --frozen`. No local toolchain rebuild
  was performed; script equality is not a reproducible-build claim.
- The measured ingress image terminates TLS inside the CVM. Gateway evidence
  binds the domain certificate SPKI; the SDK pins the actual TLS connection.
  All five compose service images are pinned by digest. Only ingress and the
  authenticated metrics exporter publish host ports.
- `inference.phala.com` is a measured TEE-only domain. Source
  `src/http/app/handlers.rs` forces verified serving there even if a client asks
  otherwise; our caller additionally binds an explicit current serving-session
  set and requires the signed request/response receipt.
- Middleware control requests use explicit metadata structs, not messages or
  tool arguments. `src/middleware/request_features.rs` derives cache-affinity
  identifiers with an HMAC key obtained from dstack KMS (`src/dstack.rs`), not an
  unkeyed prompt hash. Usage, timing, account identifiers and model metadata
  remain visible to the provider's control plane. Error reports use closed enums.
- Upstream configuration and control-plane credentials remain mutable. The
  reviewed code, mandatory verified-serving constraint and receipt are still
  required on every inference; this rotation adds no ordinary inference fallback.

## Fresh verification and limits

At 22:40:15 UTC, the installed official ACI SDK passed nonce/TDX identity,
compose-integrity/allowlist, production-OS and live TLS-SPKI channel checks using
the reviewed replacement. The identity-only probe sent no inference. The SDK's
KMS custody check (`id-5`) was skipped because the existing preview does not pin
the gateway KMS root/app ID. This review does not claim that check passed.

This gateway review does not independently establish GPU firmware, model-weight
provenance, absence of operator access to every upstream, or independent browser
release governance. Hosted JEV still exposes its bounded decision context to
OpenRouter/TypeSafe under the disclosed ZDR route. These boundaries remain in
[ATTESTATION.md](ATTESTATION.md) and [STATUS.md](STATUS.md).

The worker release changes only the measured ACI compose pin. Its reviewed worker
and terminal image digests, monetary ceilings and owner remain unchanged. A fresh
worker boot and browser receipt/payment acceptance are required after deployment.
