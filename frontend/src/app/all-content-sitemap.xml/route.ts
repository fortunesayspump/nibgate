// Single sitemap listing ALL content across ALL Subblogs
// Powered by the hub's content index — no hardcoded subdomains needed
export const dynamic = "force-dynamic";

export async function GET() {
  let urls: string[] = [];

  try {
    const res = await fetch("https://api.nibgate.xyz/api/hub/explore/content?limit=500");
    const data = await res.json();
    const items = data.content || [];
    urls = items
      .map((c: any) => c.url)
      .filter((u: string) => u && u.startsWith("https://") && u.includes(".nibgate.xyz"));
  } catch {}

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.map((url) => `<url><loc>${url.replace(/&/g, "&amp;")}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join("\n  ")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
