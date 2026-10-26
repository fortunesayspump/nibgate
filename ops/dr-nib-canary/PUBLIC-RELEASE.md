# Public private-Dr. Nib cutover

The destination is normal signed-in Dr. Nib on testnet and mainnet, without a test-wallet allowlist. Approved operating allowances: $5 testnet and a separate $5 mainnet. Keep network credentials, state and accounting separate; no new paid plan or unlimited recurring spending is authorized.

## Public admission

Set `DRNIB_PRIVATE_ACCESS_MODE=authenticated` on broker, guest, funding and watchdog. Omission retains the earlier `owner` mode; invalid values fail closed. Session authentication, signed scoped capabilities, persisted run ownership and encrypted vault boundaries remain mandatory.

The legacy-named `DRNIB_PRIVATE_TEST_TENANT_ID` remains the infrastructure control identity; in authenticated mode it does not restrict enrollment. Attestation preflight resolves the actual run owner from persisted confidential-run metadata. AI reservations share one global cap across accounts. Idle shutdown checks all tenants' active private work; settlement uses each run's persisted owner.

Changing an existing lifecycle row's access mode is rejected. While stopped, review in-flight leases and financial operations, then explicitly migrate its mode without resetting runtime or spending. Fresh scoped mainnet state can initialize in authenticated mode.

## Current service mapping (checked 24 Oct 2026)

| Service | Current role/status |
| --- | --- |
| `nibgate-drnib-private-testnet` | Testnet ciphertext broker; renamed service retains its original Railway domain and data |
| `nibgate-drnib-funding-testnet` | Testnet money/public-tools boundary |
| `nibgate-drnib-watchdog-testnet` | Testnet lifecycle reconciliation and idle-stop supervisor |
| `drnib-qa-verifier` / `drnib-qa-verifier-gateway` | Shared private verifier engine and evidence-only HTTPS gateway; preserve private DNS, HTTPS origin and SPKI pin |
| `nibgate-drnib-private-mainnet` | Mainnet ciphertext broker; owns `drnib.nibgate.xyz` |
| `nibgate-drnib-funding-mainnet` | Mainnet money/public-tools boundary |
| `nibgate-drnib-watchdog-mainnet` | Mainnet lifecycle reconciliation and idle-stop supervisor |
| `nibgate-drnib-mainnet` / `nibgate-drnib-worker-mainnet` | Retired ordinary API/worker deployments stopped and their Railway service records deleted after queue/fund checks on 24 Oct 2026; shared database records remain governed by the normal retention policy |
| `nibgate-drnib-testnet` | Retired ordinary API deployment stopped and GitHub source disconnected on 26 Oct 2026 after four funded jobs were refunded and reconciled; service/domain and Postgres remain for reviewed historical access or rollback |
| Existing Postgres hosts | Reuse hosts with isolated logical databases and restricted roles; retain old financial records |

## Testnet legacy archive

The stopped ordinary testnet API is not a report reader. The existing testnet private broker exposes `GET /v1/legacy-archive/runs`, `GET /v1/legacy-archive/runs/:id` and `GET /v1/legacy-archive/runs/:id/report?version=N` only when `DRNIB_LEGACY_ARCHIVE_ENABLED=true`. These owner-authenticated routes serve historical **plaintext** testnet rows, never private vault ciphertext. The frontend exposes them at `/dr-nib/legacy` through `/drnib-private-api`; no new research, payment, export worker or settlement route exists. Mainnet has no legacy archive.

`DRNIB_LEGACY_ARCHIVE_DATABASE_URL` must use the private Railway database host, database `railway`, schema `drnib`, and dedicated role `drnib_legacy_archive_reader`. That role has SELECT only on `ResearchRun`, `ResearchReport` and `BudgetLedger`, with no write, DDL or privileged membership. Do not reuse the broker's normal role or the database administrator. Keep the old database and service record for rollback and existing obligations. Validate owner isolation and live report reads before advertising archive availability.

Mainnet requires independent lifecycle supervision. Reuse a suitable process if available; otherwise a watchdog is necessary. Only one Phala CVM exists, the stopped testnet worker. Its network-bound configuration cannot simultaneously serve both networks; mainnet requires a separately scoped guest. Share the verifier pair instead of duplicating it. Any required new runtime must fit the mainnet allowance.

## Cutover order

1. Package the final public-access source in digest-pinned guest/control images. Existing `2712b07a` does not contain this change. Review fresh compose measurements and complete full attestation/key-possession checks.
2. Deploy matched broker, guest, funding and watchdog settings. Complete the preserved funded testnet run and verify independent-account isolation, tools/tips, report/PDF, settlement/refund, recovery and idle shutdown.
3. Configure `private-drnib.testnet.nibgate.xyz` and `private-drnib.nibgate.xyz`, matching existing frontend defaults. Verify DNS/TLS, exact origins and session handling before enabling frontend private flags. Promote testnet before mainnet with its own contracts, keys and budget.
4. Block old ordinary admissions, reconcile outstanding funds and drain queues. Retire running ordinary compute only after replacement verification. Preserve data and rollback inputs. Ordinary MCP clients cannot simply be repointed to a broker with a different API contract.

The earlier Railway deploy pause (`QH8L8B3E`) is resolved. Testnet and mainnet private research, report, export, settlement/refund, worker wake and idle shutdown were accepted separately. Preserve the evidence and distinct network caps; do not infer that a newly added archive route has passed live acceptance until it has been checked.

Petpad production `Postgres` and development `Postgres-KaGA` had successful sleep-configuration redeploys, then were explicitly taken offline at the owner's request. Both have zero active deployments and retained volumes; production Redis remains online. Do not redeploy either database merely to test sleeping.

Rollback blocks new admissions, preserves encrypted checkpoints and money journals, drains/stops the guest and restores the previous frontend. Never send private jobs to ordinary plaintext processing.
