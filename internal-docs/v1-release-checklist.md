# Nibgate v1 Release Checklist

V1 is the single-creator, creator-owned-site release.

## Product Scope

- One creator wallet owns one or more verified domains.
- The creator pastes the Hub widget on each site.
- The creator installs `@nibgate/sdk` in their site/app.
- Each content item maps to a Nibgate resource.
- Paid content uses `unlock: { mode: 'one_time' }`.
- Resource-level `recipient` controls payment routing.
- The package reports content, views, unlocks, payments, receipts, and ratings.
- The Hub dashboard shows sites, content, analytics, earnings, and reputation for owned sites.

## Out Of Scope For V1

- Multipublisher platform domains.
- Publisher identities under one verified platform site.
- Creator routes like `platform.com/@alice`.
- Platform-scoped manifests and publisher-scoped analytics.
- Subdomain publisher verification.

Those belong to v2 and are tracked in `internal-docs/v2/` and `v2-labs/`.

## Npm Publish Gate

- `packages/nibgate/package.json` has public package metadata.
- `npm --prefix packages/nibgate run pack:check` passes.
- Package tarball includes only `src` and `README.md`.
- Public docs describe the v1 creator-owned-site flow only.
- Demo examples prove package install, manifest, access response, unlock, and event reporting.
- No public docs or package types advertise v2 publisher identity fields.
