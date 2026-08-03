import { serverFetch } from "@/lib/server-fetch";
import { type BlogPost } from "@/lib/api";

export const revalidate = 3600;

async function getPosts(): Promise<BlogPost[]> {
  const posts: BlogPost[] = [];
  const pageSize = 50;
  for (let page = 1; page <= 100; page++) {
    const data = await serverFetch<{ success: boolean; posts: BlogPost[] }>(`/blog/posts?limit=${pageSize}&page=${page}`);
    const batch = data.posts || [];
    posts.push(...batch);
    if (batch.length < pageSize) break;
  }
  return posts;
}

export async function GET(request: Request) {
  const posts = await getPosts();
  const host = request.headers.get("host") || "localhost:3001";
  const protocol = host.includes("localhost") ? "http" : "https";
  const siteUrl = `${protocol}://${host}`;

  const typePath: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video" };

  const urls = posts.map((post) => {
    const path = typePath[post.type] || "posts";
    return `
  <url>
    <loc>${siteUrl}/${path}/${post.slug}</loc>
    <lastmod>${new Date(post.updatedAt || post.publishedAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/writing</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteUrl}/photos</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteUrl}/music</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteUrl}/video</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${siteUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
