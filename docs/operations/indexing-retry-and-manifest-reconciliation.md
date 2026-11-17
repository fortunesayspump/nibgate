# Indexing retry correction and manifest reconciliation plan

Status: local implementation and plan only. No deployment or production data changes.

## Indexing delivery semantics

`IndexState.sitemapHash` now advances only after Google sitemap submission and any enabled IndexNow submission are accepted. Inspection updates preserve the old hash; new inspection rows start with a null hash. A provider failure or checkpoint-write failure therefore leaves unchanged content eligible for retry. Unavailable sitemaps fail the attempt rather than recording an empty successful delivery. Failed database reads do not masquerade as new sites.

IndexNow receives a hostname in `host`, HTTPS URLs in `keyLocation` and `urlList`, and reports only the capped number of URLs sent. Both 200 and 202 mean accepted delivery; 202 additionally increments `indexNowPending`, meaning key validation is pending, not that indexing succeeded. The protocol reference is <https://www.indexnow.org/documentation?hl=en>.

This deliberately uses the existing schema and at-least-once submission semantics. A partial failure can repeat an already successful Google sitemap PUT or IndexNow submission on the next attempt. The existing four-hour cadence, soft budget, hard timeout and leased execution are unchanged. No new dependency, service, credential, security exception, migration or paid commitment is introduced. No new infrastructure costs are provisioned; successful retries still consume ordinary network/provider quota, so zero incremental usage is not promised.

Important rollout limitations:

- Old hashes written before this fix are not proof of historical delivery. This patch does not clear or reinterpret production records. Before any later rollout, inventory affected rows and prepare a bounded, explicitly selected replay of uncertain historical deliveries, under the shared Google quota budget. Do not blindly reset every hash or run unbounded immediate retries.
- IndexNow disabled by an absent key retains existing optional-provider semantics. Enabling it later requires an explicit backfill decision for previously accepted hashes.
- One shared hash avoids a schema migration but cannot suppress repeats for each provider independently. A later additive per-provider delivery ledger could do so; it is outside this patch.
- Failures in a completed batch still cause the existing next-cadence retry. Historic upstream reasons remain unavailable; this patch does not claim to diagnose those responses retrospectively.
- Rolling back to the old code reintroduces premature hash persistence. A rollback must account for uncertain deliveries rather than assuming hashes prove success.

## Non-destructive manifest reconciliation plan

Read-only diagnosis found four legacy/current identity pairs across two testnet websites. The legacy row's external ID matches the current row's primary ID, while the current row owns the canonical testnet URL and a different external ID. The legacy row is tombstoned. External-ID-first lookup updates the legacy row toward an occupied URL; its uniqueness retry selects the same row again.

Both sides can hold history. One tombstoned row has two unlock receipts, while its current counterpart has fourteen receipts and twenty ratings. No row should be deleted or merged merely to resolve URL uniqueness.

Proposed sequence, requiring a separately reviewed implementation before execution:

1. Read the hosted BlogPost IDs and canonical manifest resource IDs for each affected site. Confirm mapping to the existing Content primary IDs, network, website ownership and URLs. Same slug or title alone is insufficient evidence.
2. Record a restricted pre-change inventory of both identities, tombstones, URLs and relationship counts. Include receipt/payment identifiers and all actual Content references discovered from the schema in the integrity audit; do not export private payloads into logs or public reports.
3. Implement a resolver that checks same-website primary ID, external ID and URL independently. Recognize only a proven hosted-manifest alias where the incoming resource ID equals the current canonical URL owner's primary ID and the other external-ID holder is tombstoned. Preserve both rows' primary IDs and external IDs, every receipt/rating/metric/event relationship, and the legacy tombstone. Do not reparent financial history. Keep other ambiguous collisions as explicit failures.
4. Perform identity validation and update within a transaction with race protection. Do not globally prefer URL over external ID; preserve legitimate single-row host migrations. Preserve the existing rule that partial manifest sync cannot tombstone other content.
5. Test cross-website IDs, two active conflicting rows, moved URLs, tracking/manifest races, repeat execution, and unchanged receipt/rating/event counts and references. Test that ordinary tracking events cannot revive tombstones.
6. Review a concrete dry-run mapping for each pair before any live action. Prefer resolver-only compatibility without a data rewrite if verified identity mapping permits it. If an explicit alias table is needed, make it additive and uniquely scoped; never rewrite old IDs or delete conflicting rows.
7. Later validate testnet first, including successful manifest replay and relationship invariants. Rollback should restore resolver code while leaving historical rows untouched. Mainnet reconciliation is not implied by the testnet findings.

No reconciliation code, record merge, deletion or live replay is included in this change.
