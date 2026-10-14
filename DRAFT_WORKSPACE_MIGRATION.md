# Nibgate unified-workspace migration draft

**CONFIGURATION ONLY / NOT DEPLOYABLE**

Prepared October 14, 2026. This branch preserves the prepared release fixes and the unified-workspace configuration draft. It is not a completed release. The lockfile is unresolved and this branch is not deployment-ready. No npm publication or deployment is part of this handoff.

## Continue in another environment

The ordered release-fix and unified-workspace patches have already been applied on this branch, based on commit `b65dfa1df6accf4423a2d80d23758db2318b9103`. Do not apply them again.

```sh
git fetch origin draft/nibgate-unified-workspace-20261014
git switch --track origin/draft/nibgate-unified-workspace-20261014
```

Use an authorized Node 22 environment with pnpm 10.28.0 and registry access. From the repository root, generate the lockfile with `pnpm install --lockfile-only`, review it, then verify a clean `pnpm install --frozen-lockfile`. These commands were not run as part of publishing this preservation branch. Keep the draft deployment guards until every validation below succeeds.

## Branch deployment guards

`git.deploymentEnabled` is `false` in `vercel.json`, `frontend/vercel.json`, `docs/vercel.json`, and `subblogs/frontend/vercel.json`. This disables Vercel Git-triggered deployments for this branch whether a project uses the repository root or one of the known application roots. The only GitHub Actions workflow remains manually dispatched only. No pull request is opened as part of this handoff. Existing Railway services retain their current source branches; no deployment settings are changed by the handoff.

Do not merge this draft into `main`, manually deploy it, publish packages, or remove the deployment guards before resolving the real lockfile and validating the affected applications. Before an authorized merge, restore the branch-only Vercel deployment guards to the intended production policy and review the final install/build commands and deployment roots. The root Vercel install command is pre-existing and still needs that final review. For an eventual authorized rollout, deploy and verify the backend before releasing clients that depend on its new behavior. Never reset a live database schema or run destructive schema-push/reset commands to unblock this migration.

## Proposed configuration

- One pnpm 10.28.0 workspace and root lockfile for eleven projects, including Subblogs frontend/backend.
- First-party SDK/wallet dependencies use `workspace:*`; no vendored archives.
- The Subblogs convenience wrapper uses root pnpm filters and is not a workspace package.
- Default isolated dependency linking; no global hoisting.
- React and React DOM align at 19.2.4 for the shared wallet.
- Subblogs explicitly declares its existing Tiptap core/pm 3.31.4; the main frontend retains its own Tiptap version.
- Global Prisma overrides are removed. Existing application requirements preserve Prisma 5 for the hub/CLI/Dr. Nib and Prisma 6 for Subblogs.
- Root viem 2.54.1 remains; broad Subblogs overrides are not carried across.
- Deployment builds must use the repository root context and selected application commands. Backend Prisma generation uses its installed local CLI.

## What passed

For the existing nine-project workspace, pnpm accepted the three changed local dependency edges with an offline frozen lockfile check. A full graph traversal found no reachable registry SDK/wallet copies. Source-linked SDK/wallet imports, TypeScript checks, and a Subblogs Next production build passed using existing cached third-party dependencies.

Those consumer checks validate the source pair, **not** the proposed eleven-project dependency graph or React/Tiptap alignment.

## Current blocker

The real pnpm offline resolver cannot generate the unified lockfile because cached registry metadata for `nodemon@^3.1.9` is absent. Its package archive exists, but that is not equivalent to registry metadata. A second known missing metadata entry is `@types/nprogress@^0.2.3`. Reusing 534 authentic cached metadata responses did not resolve the missing data. No registry response or lockfile resolution was fabricated, and no network connections were attempted.

## Required before deployment

1. In an authorized environment with the required registry metadata and packages available, run pnpm 10.28.0 with Node 22 to generate the root lockfile from these manifests. Review the diff for unintended dependency upgrades and peer conflicts.
2. Confirm every first-party SDK/wallet dependency resolves locally; confirm one React identity for each application and the shared wallet; verify compatible Tiptap/ProseMirror identities and preserved Prisma majors.
3. Run a clean frozen installation from the repository root, with required generation scripts enabled.
4. Run SDK/backend/regression suites, application type checks, and production builds for the main frontend, Subblogs frontend/backend, docs, and Dr. Nib where applicable. Run the isolated PostgreSQL integration suite with its required harness.
5. Exercise the editor and wallet flows in the actual built applications. Confirm successful rendering, provider/context consistency, payment retry safety, and editor typing/formatting/serialization. A compilation-only check is insufficient for these interaction paths.
6. Verify deployment root contexts, Prisma generation, output tracing, and startup commands. Then follow the user's publication/deployment authorization and verify the resulting commit and deployed behavior.

Do not mark the unified migration complete until the real resolver, clean installation, and affected builds/tests pass.
