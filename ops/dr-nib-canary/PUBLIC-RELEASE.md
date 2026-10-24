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
| `nibgate-drnib-mainnet` / `nibgate-drnib-worker-mainnet` | Retired ordinary API/worker deployments stopped 24 Oct 2026; definitions and data retained for rollback, with auto-deploy watch paths disabled |
| Existing Postgres hosts | Reuse hosts with isolated logical databases and restricted roles; retain old financial records |

Mainnet requires independent lifecycle supervision. Reuse a suitable process if available; otherwise a watchdog is necessary. Only one Phala CVM exists, the stopped testnet worker. Its network-bound configuration cannot simultaneously serve both networks; mainnet requires a separately scoped guest. Share the verifier pair instead of duplicating it. Any required new runtime must fit the mainnet allowance.

## Cutover order

1. Package the final public-access source in digest-pinned guest/control images. Existing `2712b07a` does not contain this change. Review fresh compose measurements and complete full attestation/key-possession checks.
2. Deploy matched broker, guest, funding and watchdog settings. Complete the preserved funded testnet run and verify independent-account isolation, tools/tips, report/PDF, settlement/refund, recovery and idle shutdown.
3. Configure `private-drnib.testnet.nibgate.xyz` and `private-drnib.nibgate.xyz`, matching existing frontend defaults. Verify DNS/TLS, exact origins and session handling before enabling frontend private flags. Promote testnet before mainnet with its own contracts, keys and budget.
4. Block old ordinary admissions, reconcile outstanding funds and drain queues. Retire running ordinary compute only after replacement verification. Preserve data and rollback inputs. Ordinary MCP clients cannot simply be repointed to a broker with a different API contract.

The earlier Railway deploy pause (`QH8L8B3E`) is resolved. Control-plane services are deployed in their separate roles; this does not by itself prove the Phala guest, creator-tip, report, settlement/refund and recovery acceptance matrix. Preserve the previous funded testnet run and its evidence until those remaining checks are complete.

Petpad production `Postgres` and development `Postgres-KaGA` have `sleepApplication=true`. Both redeploy attempts were rejected by the Railway pause, so running containers have not adopted idle sleeping. Redeploy existing builds after recovery, then observe sleep. Redis and retained volumes are unchanged.

Rollback blocks new admissions, preserves encrypted checkpoints and money journals, drains/stops the guest and restores the previous frontend. Never send private jobs to ordinary plaintext processing.
