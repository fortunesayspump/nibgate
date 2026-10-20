/** Bind payment metadata to exactly the owner-approved public request. Creator
 * SDK access URLs name their canonical article in the single `path` parameter.
 * This validates metadata only; it never follows/fetches the declared resource. */
export function privatePaidResourceUrl(requestUrl, declaredUrl) {
  const fail = () => Error('PRIVATE_PAID_RESOURCE_MISMATCH');
  try {
    const request = new URL(requestUrl);
    if (request.protocol !== 'https:' || request.username || request.password || request.hash) throw fail();
    if (declaredUrl == null) return request.href;
    if (typeof declaredUrl !== 'string' || !declaredUrl.length || declaredUrl.length > 4096) throw fail();
    const resource = new URL(declaredUrl, request);
    if (resource.protocol !== 'https:' || resource.origin !== request.origin || resource.username || resource.password || resource.hash) throw fail();
    if (resource.href === request.href) return resource.href;
    const keys = [...request.searchParams.keys()];
    const path = request.searchParams.get('path');
    if (request.pathname !== '/api/nibgate/access' || keys.length !== 1 || keys[0] !== 'path' ||
        !path?.startsWith('/') || path.startsWith('//')) throw fail();
    const article = new URL(path, request.origin);
    if (article.origin !== request.origin || article.username || article.password || article.hash || resource.href !== article.href) throw fail();
    return article.href;
  } catch { throw fail(); }
}
