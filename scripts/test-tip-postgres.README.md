# Isolated tip idempotency integration tests

Run from the repository root after installing normal workspace dependencies:

```sh
npm install --prefix /tmp/nibgate-pg-harness embedded-postgres@17.9.0-beta.17 prisma@5.22.0 @prisma/client@5.22.0
NIBGATE_POSTGRES_HARNESS=/tmp/nibgate-pg-harness node scripts/test-tip-postgres.mjs
```

The harness dependencies are installed outside the repository; this does not change the application dependency graph or lockfile. PostgreSQL's package postinstall must be enabled to hydrate its binary symlinks. Run as a non-root user. Prisma downloads its normal platform engines during installation. If the engines are already installed elsewhere, its standard `PRISMA_SCHEMA_ENGINE_BINARY` override is supported.

The runner creates a fresh temporary cluster, selects an available loopback port, disables Unix sockets, generates Prisma from the actual CLI schema, pushes that schema only into `nibgate_fixture`, runs the selected integration suite, shuts down PostgreSQL, and removes its temporary files. It overrides `DATABASE_URL`; it does not use a configured application database. Do not point the opt-in test environment variables at an existing database: the suite deletes its fixture rows and installs a temporary failure trigger.

## Coverage

- Real SDK Gateway browser adapter signs a real EIP-712 fixture and serializes it into an actual route request.
- Real PostgreSQL 17.9 and Prisma 5.22.0 execute claim and Tip writes.
- Lost completed response: retry returns the same Tip ID and receipt without settling again.
- Pending and ambiguous settlement: retry does not resubmit.
- Eight first requests are synchronized before insertion, forcing seven real Prisma P2002 unique conflicts and one settlement.
- A PostgreSQL trigger rejects claim completion, proving the preceding Tip insert rolls back while the durable pending intent survives.
- Invalid EOA signature and unavailable trusted contract-wallet verification create no reservation.
- Contract-wallet fallback is exercised through a mocked read-only RPC verifier.
- Modified request binding and forged complete-claim metadata referencing an unrelated Tip are rejected.
- `/hub/pay` rejects internal claim metadata before the facilitator and refuses a tip claim as an unlock payment.
- The actual `/tips/hold` challenge is signed through the SDK; completed retry returns the same row, while a later terminal status blocks replay.
- Concurrent direct-transfer verification creates one Tip with the verifier-derived payer.

The facilitator, direct-chain receipt verifier, contract-wallet RPC, and fee-wallet resolution are mocked. These tests exercise real cryptographic EOA signatures and real database behavior, but do not broadcast, spend funds, access a live database, or establish live-chain/facilitator E2E correctness. The suite skips unless explicitly invoked with the runner-provided integration variables.
