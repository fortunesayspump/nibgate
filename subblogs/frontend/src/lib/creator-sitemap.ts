type Post = { status?: string; publicAccess?: boolean; type?: string; slug?: string; updatedAt?: string | null; publishedAt?: string | null };
type Page = {success?: boolean;posts?:Post[];total?:number;page?:number};
const paths: Record<string,string> = {article:'writing',photo:'photos',music:'music',video:'video',document:'docs'};
export async function sitemapPosts(read:(page:number)=>Promise<Page>):Promise<Post[]> {
  const posts:Post[]=[]; let expected:number|undefined;
  const identities=new Set<string>();
  for(let page=1;page<=40;page++) {
    const data=await read(page);
    if(data.success!==true || !Array.isArray(data.posts) || !Number.isSafeInteger(data.total) || data.total!<0 || data.page!==page || data.posts.length>50) throw new Error('Sitemap posts unavailable');
    if(expected!==undefined && expected!==data.total) throw new Error('Sitemap changed during pagination');
    expected=data.total!;
    if(expected>2000) throw new Error('Sitemap requires sharding');
    for (const post of data.posts) {
      const key = `${post.type}:${post.slug}`;
      if (!post.type || !post.slug || identities.has(key)) throw new Error("Duplicate or invalid sitemap pagination record");
      identities.add(key);
    }
    posts.push(...data.posts);
    if(posts.length===expected) return posts;
    if(posts.length>expected || data.posts.length!==50) throw new Error('Incomplete sitemap page');
  }
  throw new Error('Sitemap pagination limit reached');
}
export function creatorSitemap(siteUrl:string,posts:Post[]):string {
  const esc=(v:string)=>v.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
  const entries=new Map<string,string>(['/','/writing','/photos','/music','/video','/docs','/about'].map(path=>[`${siteUrl}${path}`, '']));
  for(const post of posts) {
    const path=paths[post.type || ''];
    // Match the page robots policy. Paid PUBLIC teasers are included, not bodies.
    if(post.status!=='published' || post.publicAccess!==true || !path || !post.slug || !/^[a-zA-Z0-9_-]{1,200}$/.test(post.slug)) continue;
    const raw=post.updatedAt || post.publishedAt;const date=raw?new Date(raw):null;
    entries.set(`${siteUrl}/${path}/${post.slug}`,date&&Number.isFinite(date.getTime())?date.toISOString():'');
  }
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...entries].map(([url,date])=>`<url><loc>${esc(url)}</loc>${date?`<lastmod>${date}</lastmod>`:''}</url>`).join('')}</urlset>`;
  if(entries.size>50000 || new TextEncoder().encode(xml).length>50*1024*1024) throw new Error('Sitemap requires sharding');
  return xml;
}
