import { apiUrl } from "@/lib/api";

type SitemapContent = { urls?: Array<{ url?: string; updatedAt?: string }> };

export const revalidate = 3600;
// force regenerate ISR cache on next deploy
const HUB_ALWAYS = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/blog", priority: "0.9", changefreq: "daily" },
  { path: "/explore", priority: "0.9", changefreq: "daily" },
];

export async function GET() {
  let subblogUrls: Array<{ url: string; updatedAt: string }> = [];

  try {
    const res = await fetch(apiUrl("/api/hub/sitemap/content"), { next: { revalidate: 3600 } });
    const data = (await res.json()) as SitemapContent;
    subblogUrls = (data.urls || [])
      .map((u) => ({ url: u.url || "", updatedAt: u.updatedAt || "" }))
      .filter((u) => !!u.url && u.url.startsWith("https://") && u.url.includes(".nibgate.xyz"));
  } catch {}

  const hubUrls = HUB_ALWAYS.map(
    ({ path, priority, changefreq }) => `
  <url>
    <loc>https://nibgate.xyz${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  ).join("");

  const allUrls = subblogUrls
    .map(({ url, updatedAt }) => `
  <url>
    <loc>${url.replace(/&/g, "&amp;")}</loc>
    <lastmod>${new Date(updatedAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`)
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${hubUrls}${allUrls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
