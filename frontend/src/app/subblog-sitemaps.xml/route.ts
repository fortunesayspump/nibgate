// Sitemap index listing all active Subblog sitemaps
// Submit this single URL to Google Search Console to cover all subdomains
export const dynamic = "force-dynamic";

type Site = { domain: string };

const KNOWN_SUBDOMAINS = [
  "benedict", "xwillie", "elite", "shitstories", "blacdany",
  "jeff", "jedidiah", "fortune", "blactest",
];

export async function GET() {
  let domains: string[] = [];

  try {
    // Fetch active sites from hub with high limit
    const res = await fetch("https://api.nibgate.xyz/api/hub/reputation/leaderboards?type=sites&limit=200");
    const data = await res.json();
    if (data.items) {
      domains = data.items
        .map((s: Site) => s.domain)
        .filter((d: string) => d.endsWith(".nibgate.xyz"));
    }
  } catch {}

  // Always include known sites (covers cases where leaderboard hasn't indexed them yet)
  for (const sub of KNOWN_SUBDOMAINS) {
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
