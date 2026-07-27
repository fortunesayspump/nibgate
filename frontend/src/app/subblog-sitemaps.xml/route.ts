// Sitemap index — lists all Subblogs registered in the hub
// Google discovers ALL content URLs via all-content-sitemap.xml (linked from robots.txt)
export const dynamic = "force-dynamic";

export async function GET() {
  let domains: string[] = [];

  try {
    const res = await fetch("https://api.nibgate.xyz/api/hub/sitemap-sites");
    const data = await res.json();
    if (data.sites) domains = data.sites;
  } catch {}

  const allDomains = [...new Set(domains)];

  const sitemaps = allDomains.map((d) => `
  <sitemap>
    <loc>https://${d}/sitemap.xml</loc>
  </sitemap>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}
</sitemapindex>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
