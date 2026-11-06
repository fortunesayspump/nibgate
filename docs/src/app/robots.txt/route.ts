export const dynamic = "force-static";

export async function GET() {
  const text = `User-agent: *
Allow: /
Sitemap: https://docs.nibgate.xyz/sitemap.xml`;

  return new Response(text, {
    headers: { "Content-Type": "text/plain" },
  });
}
