# Dr. Nib privacy documentation

Current as of 20 October 2026. Dr. Nib's private implementation encrypts inputs in the browser, processes them in a verified Phala worker and encrypts durable output. Phala inference is primary; actual JEV and the authorized OpenRouter/Azure ZDR fallback are provider-visible exceptions. The familiar research UI is retained. Targeted local and real Phala E2Es passed; the public production service has not been switched over.

## Read by purpose

| Need | Source of truth |
| --- | --- |
| System and data visibility | [Architecture](ARCHITECTURE.md) |
| What passed and what has not shipped | [Current status](STATUS.md) |
| Restricted production canary | [Production operations](PRODUCTION.md), [remaining plan](PLAN.md) |
| Ciphertext records and action contracts | [Protocol](PROTOCOL.md) |
| Trust, releases and key delivery | [Attestation](ATTESTATION.md) |
| Models and hosted visibility | [Model policy](PHALA-MODELS.md) |
| Charges, holds and refunds | [Budget policy](BUDGET.md) |
| Local verification | [Local testing](LOCAL-TESTING.md) |
| Acceptance evidence | [Migration acceptance](MIGRATION-ACCEPTANCE.md), [controls](BUTTON-ACCEPTANCE.md), [lifecycle](LIFECYCLE-ACCEPTANCE-2026-10-20.md) |
| Creator discovery and spending | [Creator discovery](CREATOR-DISCOVERY.md) |

Reader-facing documentation lives in `docs/src/app/dr-nib/confidential/`. Public ordinary Dr. Nib/MCP behavior remains documented separately; those routes do not become private APIs by association.

## Repository map

- `dr-nib/backend/src/privacy/`: measured guest, ciphertext broker, action journal, models, accounting, tools and lifecycle. Runtime paths remain stable for imports and image review.
- `dr-nib/tools/`: release, image/source verification, model review and infrastructure accounting helpers.
- `dr-nib/backend/test/private-*.test.js`: database integration tests; use the disposable harness.
- `frontend/src/lib/dr-nib-private-*.ts`: browser encryption, verification, vault, records and workflow integration.
- `frontend/src/app/dr-nib/`: existing product screens, including private-mode integration.
- `scripts/drnib-private-*.mjs`: explicit local/release diagnostics. Live-provider and release scripts are opt-in, may spend money or mutate dedicated test infrastructure, and are not the default test suite.
- `dr-nib/archive/`: dated experiments and superseded logs, including [20 October snapshots](../archive/privacy-2026-10-20/README.md).

## Safe local checks

Use Node 22 and installed workspace dependencies. `pnpm test:drnib-privacy` uses local fixtures; database suites must use `scripts/test-drnib-postgres.mjs` with its disposable database. Never apply test setup to customer databases. See [LOCAL-TESTING.md](LOCAL-TESTING.md) for commands and evidence limits.

Documentation changes do not authorize model calls, payments, deployment, Git pushes or a budget increase. The historical cumulative development allowance was $2.31; current status distinguishes commitments, reservations and published charges. Production spending needs separate explicit authorization.
