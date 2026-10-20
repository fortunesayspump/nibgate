# Existing setup reused for the owner canary

The owner-specific plan and prepared configuration live in `local/`, which is Git-ignored and owner-readable only. The public example stays generic. Existing secret values were not copied into documentation or the review bundle.

## Filled or prepared

| Input | Evidence / treatment |
| --- | --- |
| Owner account ID | Two matching previously signed owner records; configuration only, never a replacement for live Hub session authentication |
| Frontend account/team | Existing testnet project metadata confirmed the Vercel team; the plan selects a new separate canary project, leaving the source project untouched |
| Control workspace and region | Read-only Railway inventory confirmed the existing workspace and `europe-west4-drams3a`; the canary still targets a new isolated project/environment |
| Database host selection | Existing testnet Postgres can host a **new** `drnib_private_canary` database with four separate roles after approval. No existing database or application credentials are reused |
| Hub/auth and Arc network | Canonical testnet Hub and Arc registry; the public RPC was checked for chain ID 5042002 |
| Escrow core/splitter/operator/treasury/fee | Existing configuration and canonical defaults; contract bytecode and keeper gas passed read-only checks. Role/transaction acceptance remains part of the launch check |
| Confidential inference origin/compose pin | Existing reviewed inference reference, with its original evidence date retained. Fresh identity verification remains mandatory before execution |
| Terminal image | Existing published immutable digest confirmed through the registry; local source/runtime/package checks already passed |
| Measured pre-launch script | Recovered base script matches the pinned SHA-256; the pinned terminal syscall profile was applied locally to produce the candidate measured script |
| Broker signing key | Fresh dedicated Ed25519 key generated locally; only the public key is in the prepared configuration |
| Model price ceilings | Current Gemma admission-policy ceilings selected; fresh provider pricing still needs a launch-time check |
| OpenRouter workspace | Existing key metadata checked through the provider's key endpoint, with no inference. Credential references retained; logging/ZDR approval is not inferred from key metadata |
| Frontend/broker/funding hostnames | Selected names under the existing `nibgate.xyz` domain. They are proposals, not activated DNS/TLS routes |

The existing synthetic database, bucket credentials, old worker boot measurements, historical budget holds and same-operator QA verifier are deliberately not carried over as approved canary state. The existing QA verifier is not silently promoted: the new Nibgate-operated verifier pair still needs its own endpoint, deployment and release acceptance.

The official Phala engine is confirmed against its published security release. [VERIFIER.md](VERIFIER.md) records why the hosted quote API cannot replace the full verifier and includes a local transport recipe. No new verifier implementation is required.

## What needs the owner

1. **Deployment and spending approval later.** Proposed incremental allowance remains $5, with image publication and canary provisioning/deployment explicitly included in the eventual approval. Git pushes remain excluded. No new allowance has been approved by preparing these files.
2. **No external verifier operator is required.** Nibgate hosts the official engine/gateway in the same Railway workspace, in a separate project. Operator-hosted trust is explicit in the client build and docs. The selected hostname and private upstream are filled locally; deployment will supply the actual certificate SPKI and live acceptance evidence.
3. **Account or wallet takeover when requested.** Existing model credentials were located, so no keys need to be pasted into chat. Provider sign-in may be needed for a fresh workspace logging/ZDR review. Wallet signatures remain owner actions during the funded browser test.
4. **Rotate the legacy credential-bearing RPC token before launch.** That URL appeared during configuration inspection. The token was excluded from the canary files; they use the canonical public Arc RPC. Rotation must happen with its provider, rather than changing an unrelated chain setting.

## What the implementation will obtain after approval

These are provisioning/review tasks, not hashes or passwords the owner needs to type manually:

- Publish the reviewed guest and gateway images and record their registry manifest digests.
- Create the isolated control services/database/roles/private bucket, bind reviewed credential references, and configure the selected domains and login-origin acceptance.
- Create the dedicated Phala CVM and obtain its guest origin, CVM/app/instance identities, measured compose hash and production OS/KMS identities.
- Independently check the verifier certificate SPKI and full release controls; fill the final client/broker pins only after review.
- Refresh provider price/privacy evidence, then perform the restricted canary and actual wake-time/settlement acceptance checks.

The filled bundle remains fail-closed. Its readiness file still lists genuinely unresolved release inputs. Candidate files are not permission to deploy or release research keys.
