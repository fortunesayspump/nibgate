---
name: validate-viem-sourcey-reference
description: Rebuild and validate the source-generated Viem integration reference at its pinned public MIT-licensed source commit.
---

# Validate the Viem Sourcey Reference

Read the committed Viem source snapshot, regenerate its 24 selected API pages,
build the pages with Sourcey, and validate source identity, links, type-checked
examples and deterministic helper behavior. Return the exact source commit,
tool versions, measured coverage and output hashes in a sealed receipt.

This local runner does not contact an RPC, sign a wallet message, transfer funds,
deploy a site, claim a bounty or submit a delivery.
