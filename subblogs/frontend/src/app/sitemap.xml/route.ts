import { serverFetch } from '@/lib/server-fetch';
import { sitemapPosts, creatorSitemap } from '@/lib/creator-sitemap';

export const revalidate = 3600;
export async function GET(request: Request) {
  try {
    const deadline = AbortSignal.timeout(15000);
    const posts = await sitemapPosts(page => serverFetch(`/blog/posts?limit=50&page=${page}`, { signal:deadline }));
    const host = request.headers.get('host') || 'localhost:3001';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return new Response(creatorSitemap(`${protocol}://${host}`,posts), {headers:{
      'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300',
      'Vercel-CDN-Cache-Control':'public, s-maxage=3600, stale-while-revalidate=86400',
    }});
  } catch {
    return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'300'}});
  }
}
