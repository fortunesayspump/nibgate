# Unified workspace and payment release

Prepared October 14, 2026 from Fortama's `draft/nibgate-unified-workspace-20261014` handoff. The root lockfile is now resolved with Node 22 and pnpm 10.28.0. This release includes SDK 0.4.36, wallet 0.4.26, and OpenAPI/MCP/registry 0.2.12 for Arc mainnet and testnet.

## Workspace

- Eleven projects use one root pnpm lockfile and isolated linking. SDK/wallet consumers and their mutual dependencies resolve to local source.
- React/ReactDOM 19.2.4 and Tiptap 3.31.4 share compatible identities across the Hub, Subblogs, and wallet. Root overrides preserve the tested viem, connector, and Coinbase peer graph.
- Hub/CLI/Dr. Nib retain Prisma 5; Subblogs retains Prisma 6. Client generation uses installed CLIs. Production startup never pushes or resets schemas.
- Subblogs Railway builds must use the repository root, generate the selected app's Prisma client, and start with a pnpm package filter. Vercel app roots retain access to workspace sources and use a frozen root installation.

## Validation

- Frozen root installation and source-link/React/editor/Prisma integrity checks passed.
- SDK: 235 tests passed; the three opt-in funded live-chain tests were skipped.
- Backend: 74 tests passed; all 15 opt-in PostgreSQL retry/concurrency/rollback tests passed in a new localhost-only fixture database.
- Dr. Nib: 287 tests passed in a new localhost-only fixture database. Test setup clears inherited operator credentials and optional live service settings after Prisma initialization.
- Payment, wallet RPC, Gateway deposit/recovery, unlock feedback, and startup-schema regression scripts passed on Windows after normalizing source-harness line endings.
- Main frontend, Subblogs frontend, and docs production builds passed. Both app editors passed browser typing/formatting and sign-in/provider rendering checks. Docs search is regenerated with the documentation changes.
- Packed SDK/wallet artifacts installed in a new consumer directory with exact matching versions, one React identity, valid runtime exports, and no remaining workspace dependency protocols. Before publication, the fixture overrides the unpublished circular pair with those exact local tarballs.

Local C: ran out of space. Generated app build output and disposable npm/test caches were cleared. Subblogs/docs validation temporarily disabled webpack caching; normal repository build settings are restored before committing.

## Rollout

PR #3 merged as `0c624d6b82dc4b14959bfc6fb63838b193443e92`. Live mainnet and testnet OpenAPI, MCP initialization, tools/list, and server cards passed at 0.2.12. Railway service settings use the repository root, installed Prisma generation, and package-filtered startup. Vercel projects use Node 22, their respective app roots, access to external workspace source, and frozen root installation.

The initial SDK 0.4.35/wallet 0.4.25 publication mistakenly used `npm pack`, which retained workspace dependency protocols. Those versions are deprecated. The corrected SDK 0.4.36/wallet 0.4.26 pnpm tarballs passed a fresh consumer install, exact companion dependency checks, and public registry hash comparisons. Always use `pnpm pack`; `scripts/check-release-packs.mjs --archives-only` rejects workspace protocols directly in both tarball manifests before publication. Confirm npm processing and registry dependency metadata before promoting public tags. The client rollout restores normal Vercel Git deployment policy only after backend verification. Build commands pin pnpm 10.28.0 explicitly because Vercel otherwise selected pnpm 6 for the Hub frontend despite the correctly pinned install command.

MCP Registry 0.2.12 is published and its public record is verified active/latest. Verify discovery.md, skill.md, agent-skills, llms indexes, API/MCP, docs, and npm/CDN artifacts after deployment.

`node scripts/check-live-payment-release.mjs` checks the public API/MCP release on both networks. Add `--clients` after client rollout to check the live discovery and documentation surfaces.

No funded wallet transaction is part of automated validation. The PostgreSQL fixtures use real EOA signatures and database behavior with synthetic chain/facilitator responses; they do not establish funded live-chain correctness.

## Repeatable checks

```sh
npx pnpm@10.28.0 install --frozen-lockfile
pnpm workspace:check
pnpm test:regressions
pnpm --filter @nibgate/sdk exec vitest run --maxWorkers=1 --minWorkers=1
pnpm --filter @nibgate/backend exec vitest run --maxWorkers=1 --minWorkers=1
pnpm test:tip-postgres
pnpm test:drnib-postgres
```

The PostgreSQL runners require the external harness documented in `scripts/test-tip-postgres.README.md`; they override application database URLs and clean up their disposable clusters. Browser smoke tests use a fresh Edge session on Windows and intercept writes.
