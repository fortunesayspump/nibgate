import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import MediaEmbed from "@/components/MediaEmbed";
import NibgateUnlock from "@/components/NibgateUnlock";
import ReputationRating from "@/components/ReputationRating";
import { serverFetch } from "@/lib/server-fetch";
import { type BlogPost } from "@/lib/api";
import { fd, rd } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = { article: "Writing", photo: "Photos", music: "Music", video: "Video" };
const TYPE_ICONS: Record<string, string> = { article: "✎", photo: "▣", music: "♫", video: "▶" };

function detectEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (yt) return { type: "youtube" as const, videoId: yt[1], embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
  return { type: "unknown" as const, embedUrl: null };
}

function cleanBody(md: string) {
  return md.replace(/<[^>]*>/g, "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/[#*`\[\]()>-]/g, "").trim().slice(0, 300);
}

function postHref(post: { type: string; slug: string }) {
  const m: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video" };
  return `/${m[post.type] || "posts"}/${post.slug}`;
}

export default async function PostPage({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { slug } = await params;
  const data = await serverFetch<{ success: boolean; post: BlogPost }>(`/blog/posts/${slug}`, { next: { revalidate: 60 } });
  const post = data?.post;
  if (!post) notFound();

  const postBody = post.bodyMarkdown || "";
  const isPremium = post.price && Number(post.price) > 0;

  let images: string[] = [];
  if (post.type === "photo" && post.media) {
    try {
      const items = JSON.parse(post.media);
      if (Array.isArray(items)) images = items.map((i: any) => typeof i === "string" ? i : i.url).filter(Boolean);
    } catch {}
  }

  const relatedData = await serverFetch<{ success: boolean; posts: BlogPost[] }>(`/blog/posts?type=${post.type}&limit=6`, { next: { revalidate: 60 } });
  const related = (relatedData?.posts || []).filter((p) => p.id !== post.id).slice(0, 5);

  return (
    <>
      <Header />
      <article>
        <div className="wrap" style={{ maxWidth: "var(--wrap-post)", margin: "0 auto" }}>
          <div className="small muted font-ui" style={{ marginBottom: "0.5em" }}>
            {TYPE_ICONS[post.type] || "✎"} {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
          </div>
          <h1 style={{ marginTop: 0, marginBottom: "0.15em" }}>{post.title}</h1>
          <div className="small muted font-ui pn1" style={{ paddingTop: "0.75em" }}>
            <time>{fd(post.publishedAt)}</time>
            {post.type === "article" && <> · <span className="reading-time">{rd(postBody)}</span></>}
          </div>
          {post.excerpt && !isPremium && <p className="small muted" style={{ marginTop: "1em" }}>{post.excerpt}</p>}
        </div>

        <div className="wrap">
          {post.coverUrl && (
            <a href={post.coverUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: "1.5rem", borderRadius: "6px", overflow: "hidden" }}>
              <img src={post.coverUrl} alt={post.title} style={{ width: "100%", height: "auto", display: "block", maxHeight: "400px", objectFit: "cover" }} />
            </a>
          )}

          {post.type === "video" && post.videoUrl && (
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px", marginBottom: "1.5rem" }}>
              <iframe src={(() => { const e = detectEmbed(post.videoUrl!); return e.type === "youtube" && e.embedUrl ? e.embedUrl : post.videoUrl; })()} title={post.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
            </div>
          )}

          {post.type === "photo" && images.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              {images.map((url, i) => (
                <div key={i} style={{ overflow: "hidden", borderRadius: "6px", background: "var(--border)" }}>
                  <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`${post.title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" /></a>
                </div>
              ))}
            </div>
          )}

          {post.type === "photo" && post.media && (() => {
            let items: { url: string; caption?: string }[];
            try { items = JSON.parse(post.media); } catch { return null; }
            if (!Array.isArray(items) || items.length === 0) return null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                {items.map((item, i) => (
                  <div key={i}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      <img src={item.url} alt={item.caption || `${post.title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px" }} loading="lazy" />
                    </a>
                    {item.caption && <p className="small muted" style={{ marginTop: "0.3em" }}>{item.caption}</p>}
                  </div>
                ))}
              </div>
            );
          })()}

          {isPremium ? (
            <NibgateUnlock resource={{ id: post.id, title: post.title, type: post.type, price: post.price || "0", path: `/${TYPE_LABELS[post.type]?.toLowerCase() || "posts"}/${post.slug}` }} />
          ) : post.type === "article" ? (
            <div className="prose prose-neutral dark:prose-invert">
              <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
            </div>
          ) : (
            cleanBody(post.bodyMarkdown) && (
              <div className="prose prose-neutral dark:prose-invert">
                <p>{cleanBody(post.bodyMarkdown)}</p>
              </div>
            )
          )}
        </div>

        <div className="wrap">
          <ReputationRating resource={{ id: post.id, title: post.title, type: post.type, price: post.price || "0", path: `/${TYPE_LABELS[post.type]?.toLowerCase() || "posts"}/${post.slug}` }} />
        </div>

        {related.length > 0 && (
          <>
            <hr />
            <div className="wrap pn1">
              <p className="muted small font-ui" style={{ marginBottom: "1em" }}>More {TYPE_LABELS[post.type] || post.type}</p>
              <ul className="list-plain">
                {related.map((p) => (
                  <li key={p.id}>
                    <Link href={postHref(p)} className="internal-link">
                      {p.type !== "article" && <span className="type-icon">{TYPE_ICONS[p.type]}</span>}
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </article>
    </>
  );
}
