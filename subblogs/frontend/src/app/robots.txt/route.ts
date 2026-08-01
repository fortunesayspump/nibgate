export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host = request.headers.get("host") || "localhost:3001";
  const protocol = host.includes("localhost") ? "http" : "https";
  const siteUrl = `${protocol}://${host}`;

  const text = `User-agent: *
Allow: /
Disallow: /admin
Sitemap: ${siteUrl}/sitemap.xml`;

  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}
