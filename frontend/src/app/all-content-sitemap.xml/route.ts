import { activeNetworkName } from '@/lib/api';
import { centralSitemapIndex } from '@/lib/central-sitemap';

export const revalidate = 3600;

export async function GET() {
  if (activeNetworkName() !== 'mainnet') return new Response('Not available', { status:404, headers:{'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'} });
  try {
    // One upstream call regardless of tenant count. The feed verifies real Site
    // records, caches lookups and returns503 on unknown/partial availability.
    const response = await fetch('https://api.nibgate.xyz/hub/sitemap-sites', {
      next:{revalidate:3600}, redirect:'error', signal:AbortSignal.timeout(15000),
      headers:{accept:'application/json'},
    });
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Sitemap source unavailable');
    return new Response(centralSitemapIndex(await response.json()), {headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'}});
  } catch {
    // Never turn an unavailable source into a successful incomplete index.
    return new Response('Sitemap temporarily unavailable', {status:503,headers:{'Cache-Control':'no-store','Retry-After':'300'}});
  }
}
