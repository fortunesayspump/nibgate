import { apiUrl } from "@/lib/api";

type ExploreContent = { content?: Array<{ url?: string }> };

export const revalidate = 3600;

const HUB_ALWAYS = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/blog", priority: "0.9", changefreq: "daily" },
  { path: "/explore", priority: "0.9", changefreq: "daily" },
];

export async function GET() {
  let subblogUrls: string[] = [];

  try {
    const res = await fetch(apiUrl("/api/hub/explore/content?limit=500"), { next: { revalidate: 3600 } });
    const data = (await res.json()) as ExploreContent;
    subblogUrls = (data.content || [])
      .map((c) => c.url)
      .filter((u): u is string => !!u && u.startsWith("https://") && u.includes(".nibgate.xyz"));
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
    .map((url) => `
  <url>
    <loc>${url.replace(/&/g, "&amp;")}</loc>
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
