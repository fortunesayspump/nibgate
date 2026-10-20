# Existing setup reused for the owner canary

The owner plan, credentials, rollback backups and generated bundle live under Git-ignored `local/`. Do not copy secret values into documentation. See [ROLLOUT.md](ROLLOUT.md) for the selected deployment sequence and current blocker.

| Input | Selected source / treatment |
| --- | --- |
| Railway project | Existing testnet project; no additional project |
| Broker | Existing private synthetic service, new scoped canary credentials |
| Verifier | Existing private official dstack-verifier 0.6.1 engine and HTTPS gateway; gateway CORS/image updated and checked |
| Database | New logical `drnib_private_canary` already created on existing Postgres, four separate restricted logins; old databases unchanged |
| Object storage | Existing private ciphertext bucket; no public bucket |
| Phala worker | Existing stopped production-OS small CVM; independently review new compose and accepted identities |
| Frontend | Existing testnet Vercel project, release-branch preview; no production promotion |
| Hub / network | Canonical testnet Hub, Arc registry and public RPC |
| Signing / payment credentials | Dedicated broker key and separated guest/funding/watchdog scopes; money keys never enter the broker |
| Images | Published immutable guest and gateway digests; existing pinned terminal image |
| Hosted model routes | Fresh JEV/TypeSafe and Azure fallback probes with request-level ZDR, matched key/workspace, prompt storage and broadcast off |
| Budget | $5 incremental testnet allowance approved; $0.000017 public route probes included in its $1 AI share |

Funding and independent shutdown services may be added only where no safe existing service can satisfy their credential/lifecycle boundary. Legacy records and unresolved money operations prevent blindly replacing ordinary APIs. Empty newly created projects were removed; their staged services never ran.

The remaining owner actions are gateway deployment-tool approval, later wallet signing, and rotation of the legacy exposed RPC token through its provider. No keys or recovery codes belong in chat. Mainnet deployment and spending require separate approval.

Compose/KMS control-plane review, verifier TLS SPKI and exact-origin checks are recorded locally. Fresh session verification and the live owner canary remain release tasks. Existing identity metadata is not approval of a new boot. The owner bundle stays fail-closed until those reviews pass.
