import { siteOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET() {
  const site = siteOrigin();
  const text = `User-agent: *
Allow: /
Sitemap: ${site}/sitemap.xml
Sitemap: ${site}/all-content-sitemap.xml
`;
  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}
