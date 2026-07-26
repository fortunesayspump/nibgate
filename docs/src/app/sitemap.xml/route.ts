export const dynamic = "force-dynamic";

const siteUrl = "https://docs.nibgate.xyz";

const pages = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/overview", priority: "0.9", changefreq: "weekly" },
  { path: "/architecture", priority: "0.8", changefreq: "weekly" },
  { path: "/lifecycle", priority: "0.8", changefreq: "weekly" },
  { path: "/agent-discovery", priority: "0.8", changefreq: "weekly" },
  { path: "/reputation", priority: "0.8", changefreq: "weekly" },
  { path: "/quick-start", priority: "0.9", changefreq: "weekly" },
  { path: "/install-package", priority: "0.8", changefreq: "weekly" },
  { path: "/content-structures", priority: "0.8", changefreq: "weekly" },
  { path: "/widget", priority: "0.8", changefreq: "weekly" },
  { path: "/verify-site", priority: "0.8", changefreq: "weekly" },
  { path: "/content-events", priority: "0.8", changefreq: "weekly" },
  { path: "/analytics-events", priority: "0.8", changefreq: "weekly" },
  { path: "/payments-receipts", priority: "0.8", changefreq: "weekly" },
  { path: "/api-reference", priority: "0.9", changefreq: "weekly" },
  { path: "/examples", priority: "0.7", changefreq: "weekly" },
  { path: "/roadmap", priority: "0.7", changefreq: "weekly" },
];

export async function GET() {
  const urls = pages
    .map(
      (page) => `
  <url>
    <loc>${siteUrl}${page.path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
