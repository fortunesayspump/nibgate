import { apiUrl, type BlogPost } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(apiUrl("/blog/posts"));
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRssDate(value: string): string {
  return new Date(value).toUTCString();
}

async function getSiteName(): Promise<string> {
  try {
    const res = await fetch(apiUrl("/site"), { next: { revalidate: 3600 } });
    if (!res.ok) return "Nibgate Blog";
    const d = await res.json();
    return d.site?.name || "Nibgate Blog";
  } catch { return "Nibgate Blog"; }
}

export async function GET() {
  const [posts, siteName] = await Promise.all([getPosts(), getSiteName()]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.NEXT_PUBLIC_VERCEL_URL && `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`)
    || "http://localhost:3001";

  const items = posts
    .map(
      (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${siteUrl}/posts/${post.slug}</link>
      <guid isPermaLink="true">${siteUrl}/posts/${post.slug}</guid>
      <description>${escapeXml(post.excerpt || post.title)}</description>
      <pubDate>${formatRssDate(post.publishedAt)}</pubDate>
      <category>${escapeXml(post.tag || "General")}</category>
    </item>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${siteUrl}</link>
    <description>Product updates, creator guides, and thinking behind the reputation layer.</description>
    <language>en</language>
    <lastBuildDate>${formatRssDate(new Date().toISOString())}</lastBuildDate>
    <atom:link href="${siteUrl}/api/feed" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
