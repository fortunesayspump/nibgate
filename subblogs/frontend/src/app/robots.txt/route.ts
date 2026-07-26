export const dynamic = "force-dynamic";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.NEXT_PUBLIC_VERCEL_URL && `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`)
    || "http://localhost:3001";

  const text = `User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml`;

  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}
