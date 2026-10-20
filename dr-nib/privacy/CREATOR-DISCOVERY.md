# Creator discovery and protected tipping

Real owner-scoped Phala acceptance passed on 20 October 2026. Job 51 proved
paid creator access and settlement/refund. Job 52 proved the stronger preference:
JEV selected $0.025 for the cited original creator, deposited once to the Hub
claimbox, with $0.215395 refunded from the $0.25 deposit after $0.034605 total
charges. This proves held-tip funding, not creator claim/release. No public
production launch is established.

The extension's `mapPage` implementation is reused, rather than a new hostname
heuristic. `scripts/drnib-build-creator-detector.mjs` bundles its page model and
local deterministic JEV ranking code; a source-hash contract detects drift.
Already-fetched public HTML is parsed in a credential-free, resource-bounded
ordinary public-tools worker with no page scripts or external resource loading. Its signal identifies
substantive content, author, type and tip eligibility. It is not proof of wallet
ownership, factual reliability, or a native hosted-JEV judgment.

Public discovery reuses the existing normal retrieval registry, its configured
SearXNG instance, direct extraction and the Hub's existing recipient/tip rails.
The extension's DOM detector itself runs in the extension; `/hub/resolve` resolves
verified recipients and does not classify article content. The ordinary public
tools process reuses the generated extension detector in one reusable bounded
worker with a URL/HTML-fingerprint cache. No duplicate detector or search service
runs inside Phala. Public HTML is fetched and assessed once on this path.

Only the setup-approved PUBLIC query and creator preference cross this boundary.
The same public query is searched once per provider through the shared registry.
When creator tips are enabled, this includes the existing Hub endpoint
`/hub/explore/content` on the configured canonical mainnet/testnet API host.
Hub results win relevance ties, while higher-relevance web results still win.
The configured web index and practitioner sources remain in the mix, and Hub
failure/empty results never disable the web fallback. Discovery is metadata-only;
paid access still requires its own exact approval. It does not duplicate the query with keyword variants. Search is explicitly free-only, even if other server model/search
keys exist, with a shared deadline and partial-result retention. Paid search
needs separate admission. The browser automatically continues only the exact
zero-cost query/preference already approved at setup, including after reload;
new queries, URLs, bodies and payments still need their own approval. Public
results return encrypted into the attested workflow; uploads, chat, private
research state and document keys never enter public detection. Actual JEV still
judges relevance, trust and quality, and snippets remain labeled as excerpts.

Creator-aware discovery also uses the keyless [Mwmbl index](https://docs.searxng.org/dev/engines/online/mwmbl.html)
through the existing retrieval registry. It is queried directly once, rather
than repeated through SearXNG; its small index supplements the other providers.

Paid alternatives are optional future ports, not enabled subscriptions:
[Exa search](https://exa.ai/docs/reference/search) supports `personal site` and
other source categories; [Brave search](https://api-dashboard.search.brave.com/api-reference/web/search/post)
supports custom Goggles ranking and additional snippets. Neither is configured
here. Any paid port must use explicit admission, recorded usage, recipient
and retention disclosure, and the existing run budget.

When tipping is enabled, the post-report stage considers verified creator pages
that were actually cited in the report body. It deduplicates creator/site
candidates and excludes previously paid URLs. The trusted money snapshot counts
actual calls and unresolved commitments. The initial tip pool is at most 20%
of the run cap across all report versions, including unresolved tips, and the complete plan estimate remains reserved for research
and follow-ups. Integer micro-USD allocation bounds every candidate amount;
actual JEV confirms eligibility and selects an affordable amount. Qualifying
creators receive a proposal; they are not silently skipped by a generic
optional gratitude loop. Exact public URL/amount approval remains mandatory.
Disabled tipping, source-only runs, declined approval, unavailable eligibility,
insufficient headroom or the approval limit cannot authorize a transfer. A held
tip is described as deposited for creator claim, rather than already received.
The separate money service independently admits each charge and prevents replay.

## Terminal privacy boundary

The full-terminal candidate runs real Bash, Python, curl and Node through a
pinned gVisor Linux runtime inside the confidential guest. Its root filesystem
contains public binaries/libraries and the selected job files, not the worker's
application data, service environment, Docker socket, dstack socket or wallets.
Small selected text artifacts can be carried into subsequent commands through
encrypted project state. Runtime, disk, process, time and output limits apply.

Direct outbound sockets are disabled. Exact owner-approved public HTTP tools
perform real requests first and persist their results encrypted. A per-job
HTTPS response cache lets curl and proxy-aware Python consume those exact real
responses; undeclared destinations/methods/bodies are rejected. This is not
unrestricted interactive Internet access. Paid APIs remain separate budgeted
payment tools, and no payment credential is copied into the terminal. Common
Python packages are preinstalled; arbitrary package installation and protocols
must satisfy this same network policy. No ordinary remote sandbox fallback is
permitted for private data.

The real local container passes Bash/Python/Node/jq execution, restored files,
host/environment/direct-network isolation, curl/Python TLS cache and rejected
symlink-artifact checks. The image loads NumPy/Pandas, but their gVisor import
hit the emulator's 60-second job limit. The subsequent native Phala check passes
NumPy/Pandas/Node, artifacts and both isolation/cache checks in 8.5 seconds on
the freshly measured release. The full measured browser workflow remains
pending. The scoped outer runtime setup
is documented in `../private-terminal/SECURITY.md`. No ordinary fallback is used.

Primary runtime references: [gVisor security model](https://gvisor.dev/docs/architecture_guide/security/),
[OCI execution](https://gvisor.dev/docs/user_guide/quick_start/oci/),
[rootless limitations](https://gvisor.dev/docs/user_guide/rootless/).

## Contribution-aware JEV tipping (20 October local candidate)

JEV sees the bounded research question, report excerpt and source contribution.
It is prompted to favor a meaningful affordable tip for original work actually
used. Fiction, satire and creative work qualify when analyzed on their own
terms; Hub membership, keyword overlap and factual claims unsupported by that
work do not qualify it. Buying access is separate from appreciation, but that
expense still reduces the affordable tip pool. Hard citation, trust, shared
extension-detector, aggregate 20% pool and research-reserve checks remain.
An unfavorable JEV recommendation is disclosed and waits for owner approval or
decline rather than ending tipping silently. Every payment keeps exact
URL/amount approval, recipient resolution and normal settlement admission.

Validation: 15 creator/retrieval privacy tests, 25 shared retrieval tests and
17 agent/public-request tests passed. The real production Hub metadata request
returned four safe results at zero API cost. These tests establish wiring and
bounds; they do not establish a live JEV tipping rate or a completed transfer.
