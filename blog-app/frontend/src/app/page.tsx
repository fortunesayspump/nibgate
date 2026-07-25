import Link from "next/link";
import Header from "@/components/Header";
import { serverFetch } from "@/lib/server-fetch";
import { type BlogPost } from "@/lib/api";
import { fd, rd } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = { article: "Writing", photo: "Photos", music: "Music", video: "Video" };
const TYPE_ORDER = ["article", "photo", "music", "video"];

function yr(v: string) { return new Date(v).getFullYear().toString(); }
function mo(v: string) { return String(new Date(v).getMonth() + 1).padStart(2, "0"); }

async function getGrouped() {
  try {
    return await serverFetch<Record<string, BlogPost[]>>("/blog/posts-by-types", { next: { revalidate: 60 } });
  } catch { return {}; }
}

function TypeIcon({ type }: { type: string }) {
  if (type === "photo") return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
  if (type === "music") return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
  if (type === "video") return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
  return null;
}

function PostListItem({ post }: { post: BlogPost }) {
  return (
    <li>
      <Link href={`/posts/${post.slug}`} className="internal-link plain" target="_blank" rel="noopener noreferrer">
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span className="muted ppr flex-shrink small mh nowrap font-ui">{yr(post.publishedAt)} · {mo(post.publishedAt)}</span>
          {post.type !== "article" && (
            <span className="type-icon"><TypeIcon type={post.type} /></span>
          )}
          <u>{post.title}</u>
        </div>
      </Link>
    </li>
  );
}

function extractFirstImage(md: string, coverUrl?: string | null, media?: string | null): string | null {
  if (coverUrl) return coverUrl;
  if (media) {
    try {
      const items = JSON.parse(media);
      if (Array.isArray(items) && items.length > 0 && items[0].url) return items[0].url;
    } catch {}
  }
  const m = md.match(/!\[.*?\]\((.*?)\)/);
  return m ? m[1] : null;
}

function ThumbnailCard({ post, icon }: { post: BlogPost; icon?: string }) {
  const img = extractFirstImage(post.bodyMarkdown, post.coverUrl, post.media);
  return (
    <Link key={post.id} href={`/posts/${post.slug}`} className="plain block" style={{ aspectRatio: "4/3", overflow: "hidden", borderRadius: "6px", background: "var(--border)", position: "relative" }}>
      {img ? (
        <img src={img} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "var(--text-sm)" }}>{post.title}</div>
      )}
      {icon && (
        <span style={{ position: "absolute", bottom: "0.4rem", right: "0.4rem", width: "1.6rem", height: "1.6rem", borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>{icon}</span>
      )}
    </Link>
  );
}

function GridSection({ posts, icon }: { posts: BlogPost[]; icon?: string }) {
  return (
    <div className="thumb-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem" }}>
      {posts.slice(0, 8).map(post => <ThumbnailCard key={post.id} post={post} icon={icon} />)}
    </div>
  );
}

function PostSection({ type, posts }: { type: string; posts: BlogPost[] }) {
  if (!posts.length) return null;
  const label = TYPE_LABELS[type] || type;
  const useGrid = type === "photo" || type === "video";

  return (
    <>
      <p className="muted font-ui section-header">{label}</p>
      {useGrid ? (
        <GridSection posts={posts} icon={type === "video" ? "▶" : undefined} />
      ) : (
        <ul className="list-plain tabular-nums">
          {posts.map((post, i) => (
            <PostListItem key={post.id} post={post} />
          ))}
        </ul>
      )}
    </>
  );
}

function latestAcross(grouped: Record<string, BlogPost[]>): BlogPost | null {
  let latest: BlogPost | null = null;
  for (const type of TYPE_ORDER) {
    const posts = grouped[type] || [];
    if (posts.length > 0) {
      const p = posts[0];
      if (!latest || new Date(p.publishedAt) > new Date(latest.publishedAt)) latest = p;
    }
  }
  return latest;
}

export default async function HomePage() {
  const grouped = await getGrouped();
  const latest = latestAcross(grouped);

  return (
    <>
      <Header />
      <main>
        <div className="wrap" style={{ maxWidth: "var(--wrap-normal)", marginLeft: "auto", marginRight: "auto" }}>
          {latest && (
            <>
              <p><Link href={`/posts/${latest.slug}`} className="muted font-ui">Latest</Link></p>
              <div>
                <Link href={`/posts/${latest.slug}`} className="plain">
                  {latest.coverUrl && (
                    <img src={latest.coverUrl} alt="" style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 8, marginBottom: 12 }} />
                  )}
                  <h2>{latest.title}</h2>
                  <div className="metadata muted small pb font-ui">
                    <time>{fd(latest.publishedAt)}</time>
                    {latest.type === "article" && <> · <span>{rd(latest.bodyMarkdown)}</span></>}
                  </div>
                  <div className="small muted">
                    {latest.excerpt} Keep&nbsp;reading&nbsp;→
                  </div>
                </Link>
              </div>
              <hr className="mn2 ms2" />
            </>
          )}

          {TYPE_ORDER.flatMap((type, i) => {
            const section = <PostSection key={type} type={type} posts={grouped[type] || []} />;
            if (!(grouped[type] || []).length) return [];
            if (i === 0) return [section];
            return [<hr key={`hr-${type}`} className="mn2 ms2" />, section];
          })}
        </div>
      </main>
    </>
  );
}
