export const dynamic = "force-dynamic";
export async function GET() {
  const text = `User-agent: *
Allow: /
Sitemap: https://nibgate.xyz/sitemap.xml
Sitemap: https://nibgate.xyz/subblog-sitemaps.xml
Sitemap: https://nibgate.xyz/all-content-sitemap.xml`;
  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}
