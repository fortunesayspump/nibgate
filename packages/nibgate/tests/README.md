# Nibgate package tests

Runtime package code should not fake payments or expose test controls in creator-facing UI.

Use this folder for package-level tests around:

- resource normalization
- payment proof creation and verification
- browser unlock flows
- server access responses
- hub event emission
- Gateway receipt handling

Dev-only event seeding helpers live in `nibgate/testing`, not `nibgate` or `nibgate/server`.
