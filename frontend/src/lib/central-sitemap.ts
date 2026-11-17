// Only canonical public mainnet creators; Hub identities can mirror across networks.
const reserved = new Set('www api api-subblogs testnet testnet-api testnet-api-subblogs drnib private-drnib admin app blog dev staging test mail smtp pop imap webmail email help support docs status forum auth login signin register signup dashboard hub explore discover cdn static assets media files root home index main console manage management operator pay payment payments checkout webhook webhooks hook hooks ssl dns ns1 ns2 mx'.split(' '));
export function mainnetTenant(host: unknown): string | null {
  if (typeof host !== 'string') return null;
  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/.exec(host);
  return match && !reserved.has(match[1]) && !match[1].startsWith('testnet-') ? match[1] : null;
}
export function centralSitemapIndex(data: unknown): string {
  const feed = data as { success?: boolean; sites?: unknown[] };
  if (feed?.success !== true || !Array.isArray(feed.sites)) throw new Error('Sitemap site list unavailable');
  // These are leaf urlsets, not nested indexes. Keep the current Hub blog pages.
  const urls = [...new Set(['https://nibgate.xyz/sitemap.xml', 'https://docs.nibgate.xyz/sitemap.xml',
    ...feed.sites.filter(host => mainnetTenant(host)).map(host => `https://${host}/sitemap.xml`)])].sort();
  if (urls.length > 50000) throw new Error('Sitemap index requires sharding');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url=>`<sitemap><loc>${url}</loc></sitemap>`).join('')}</sitemapindex>`;
  if (new TextEncoder().encode(xml).length > 50*1024*1024) throw new Error('Sitemap index requires sharding');
  return xml;
}
