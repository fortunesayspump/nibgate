// Experimental transport adapter only. No route is registered by this module.
// A future combined public-page handler must use the authoritative tenant and
// published post, then serialize this allowlist instead of raw models or /site.
function publicPageDTO(site, post) {
  if (!post || post.status !== 'published') return null;
  if (!site || !site.id || post.siteId !== site.id) throw new Error('Public page tenant mismatch');
  const locked = post.publicAccess !== true || post.isLocked === true || (post.price != null && String(post.price) !== '0');
  const safe = {};
  for (const key of ['id','slug','type','title','excerpt','price','publicAccess','publishedAt','updatedAt','coverUrl']) safe[key] = post[key];
  safe.isLocked = locked;
  if (post.author) safe.author = {name:post.author.name};
  // Private fields, embedded credentials and arbitrary model properties are
  // never copied. Even inspecting body type happens only after the access gate.
  if (!locked && post.type === 'article' && typeof post.bodyMarkdown === 'string') safe.bodyMarkdown = post.bodyMarkdown;
  return {success:true,site:{id:site.id,name:site.name,description:site.description || '',subdomain:site.subdomain},post:safe};
}
module.exports = {publicPageDTO};
