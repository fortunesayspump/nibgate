// Sitemap index listing all active Subblog sitemaps
export const dynamic = "force-dynamic";

type Site = { domain: string };

export async function GET() {
  let domains: string[] = [];

  try {
    const res = await fetch("https://api.nibgate.xyz/api/hub/reputation/leaderboards?type=sites&limit=100");
    const data = await res.json();
    domains = (data.items || [])
      .map((s: Site) => s.domain)
      .filter((d: string) => d.endsWith(".nibgate.xyz"));
  } catch {}

  // Always include known active blogs even if API fails
  const known = ["benedict", "xwillie", "elite", "shitstories", "blacdany", "jeff", "jedidiah", "fortune"];
  for (const sub of known) {
    if (!domains.includes(`${sub}.nibgate.xyz`)) {
      domains.push(`${sub}.nibgate.xyz`);
    }
  }

  const sitemaps = [...new Set(domains)].map((d) => `
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
