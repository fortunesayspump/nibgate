import { siteOrigin } from "@/lib/api";

export async function GET() {
  const site = siteOrigin();
  const text = `User-agent: *
Allow: /
Sitemap: ${site}/sitemap.xml
Sitemap: ${site}/all-content-sitemap.xml
`;
  return new Response(text, { headers: {
    "Content-Type": "text/plain",
    "Cache-Control": "public, max-age=300",
    "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
  } });
}
