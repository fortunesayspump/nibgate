# V2 Labs

Experimental work that is intentionally outside the v1 npm release path.

## Multipublisher Platform

`multipublisher-platform/` contains the future Nibgate platform app: many creators publishing under one verified platform domain, with per-creator routes, wallet-linked publisher identities, and publisher-scoped metrics.

For v1, Nibgate ships the simpler creator-owned-site flow:

```txt
creator wallet -> verified creator domain -> package resource -> events/receipts/reputation
```

Do not wire `v2-labs` into root workspaces, public docs, or npm publish checks until the v2 platform identity model is stable.
