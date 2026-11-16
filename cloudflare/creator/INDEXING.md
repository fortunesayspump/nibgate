# Production creator search policy

The original migration Worker applied noindex to every rendered response,
including mainnet pages whose frontend metadata explicitly allowed indexing.
Mainnet and wildcard Workers now leave robots policy to the existing response
and page metadata only for successful public HTML routes and sitemap XML.
They do not delete an upstream robots directive. Admin/API responses, framework
RSC/prefetch responses, errors and responses setting cookies remain excluded.
Private no-store caching, credential stripping, host/path guards and reader
access proxies are unchanged. Asset and other non-page exclusions are retained.

Individual post metadata is fail-closed: only a published, publicAccess=true
post on the correct type route in a mainnet build is indexable. Public paid
posts expose only their existing teaser; backend redaction and payment gates
still protect bodies, keys and media. Invite-only, draft, missing and unknown
posts remain noindex. Testnet keeps its existing blanket noindex policy, even
when its sitemaps are submitted to Google at the owner's request.

Deploy mainnet, Lowfi and wildcard targets using their existing reviewed build
configuration. Verify live response headers AND rendered robots metadata on a
public free post, public paid teaser, invite-only/missing post, admin page and
RSC request. Build success alone does not establish Google indexing. Do not
change tenant data, payment gates or cache policy to validate this release.
