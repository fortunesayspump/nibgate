# Search indexing and network identity

Hub Website identities can mirror across mainnet and testnet without copying
creator Site records or content. `/hub/sitemap-sites` checks canonical creator
hosts against that network's fixed public creator API. It does not interpret an
identity-only mirror as a published site, or require a real site to have posts.
Known platform sitemap hosts are preserved; reserved/API hosts are excluded.

Both positive and confirmed-negative lookups are cached for five minutes.
At most six reads run concurrently per enumeration; same-key in-flight reads
coalesce. A lookup has a three-second deadline and a batch a ten-second deadline.
Transient errors are not absence: recent positive results can survive a brief
outage for thirty minutes; otherwise the feed returns503, not a false empty list.
Failures back off for five minutes and honor longer429 Retry-After values.
Caches are per process, bounded to2000 keys. For52 stable candidates polled every
ten seconds, tests observe156 creator reads per fifteen minutes. Other backend
traffic and additional Hub replicas share infrastructure capacity, so this is not
a guarantee of total backend rate headroom;429 remains a retryable availability
failure, never evidence that sites disappeared.

GSC sitemap and index monitors run on both networks when configured. Submission
helpers accept only canonical domains matching the active network. The owner
explicitly requested testnet sitemap submission; noindex headers remain unchanged,
and submission does not guarantee indexing. GSC_HUB_BASE can override the source
Hub; the default follows the active network. GSC_SITE selects the verified Search
Console property; its default sc-domain:nibgate.xyz covers both networks.
No existing Google submissions are removed by filtering the feed.

Release checks: confirm mainnet feed omits identity-only Fortune/Jeff while real
mainnet tenants remain, and testnet feed uses canonical testnet creator hosts
without reserved API entries. Confirm the configured Search Console property covers each submitted host. Check mainnet request logs for429 and preserve noindex until its
separate release policy is reviewed. OpenAPI/MCP/registry versions are aligned;
publishing the MCP registry record is a separate authenticated release step.
