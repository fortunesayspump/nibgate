import { apiUrl } from "@/lib/api";

type BlogPost = { slug: string; updatedAt: string; publishedAt: string };

export const revalidate = 3600;

async function getPosts(): Promise<BlogPost[]> {
  try {
    const res = await fetch(apiUrl("/api/blog/posts"), { next: { revalidate: 3600 } });
    const data = await res.json();
    return data.posts || [];
  } catch { return []; }
}

export async function GET() {
  const posts = await getPosts();
  const siteUrl = "https://nibgate.xyz";

  const urls = posts.map((post) => `
  <url>
    <loc>${siteUrl}/blog/${post.slug}</loc>
    <lastmod>${new Date(post.updatedAt || post.publishedAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteUrl}/explore</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
