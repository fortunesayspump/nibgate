import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import MediaEmbed from "@/components/MediaEmbed";
import NibgateUnlock from "@/components/NibgateUnlock";
import ReputationRating from "@/components/ReputationRating";
import { apiUrl, type BlogPost } from "@/lib/api";
import { detectEmbed } from "@/lib/media";

function fd(v: string) { return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(v)); }
function rd(body: string) { return `${Math.max(1, Math.round(body.trim().split(/\s+/).length / 200))} min read`; }

async function getPost(slug: string) {
  try {
    const r = await fetch(apiUrl(`/blog/posts/${slug}`), { next: { revalidate: 60 } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.post as BlogPost;
  } catch { return null; }
}

async function getRelated(currentSlug: string, type?: string) {
  try {
    const r = await fetch(apiUrl("/blog/posts"), { next: { revalidate: 60 } });
    if (!r.ok) return [];
    const d = await r.json();
    return ((d.posts || []) as BlogPost[]).filter((p: BlogPost) => p.slug !== currentSlug && (!type || p.type === type)).slice(0, 8);
  } catch { return []; }
}

const TYPE_ICONS: Record<string, string> = { article: "✎", photo: "◷", music: "♫", video: "▶" };

function extractImages(md: string): string[] {
  const re = /!\[.*?\]\((.*?)\)/g;
  const urls: string[] = [];
  let m;
  while ((m = re.exec(md)) !== null) urls.push(m[1]);
  return urls;
}

function extractLinks(md: string): { text: string; url: string }[] {
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const links: { text: string; url: string }[] = [];
  let m;
  while ((m = re.exec(md)) !== null) links.push({ text: m[1], url: m[2] });
  return links;
}

function cleanBody(md: string): string {
  return md.replace(/!\[.*?\]\(.*?\)/g, "").replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1").trim();
}

type PW = BlogPost & { price?: string };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = (await getPost(slug)) as PW | null;
  if (!post) notFound();

  const isPremium = Boolean(post.price && post.price !== "0");
  const images = extractImages(post.bodyMarkdown);
  const links = extractLinks(post.bodyMarkdown);
  const related = await getRelated(slug, post.type);
  const tagList = typeof post.tags === "string"
    ? post.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : Array.isArray(post.tags) ? post.tags.filter(Boolean) : undefined;

  return (
    <>
      <Header />
      <main>
        <div className="wrap" style={{ marginBottom: "2rem" }}>
          <div className="small muted font-ui" style={{ marginBottom: "0.5em" }}>
            {TYPE_ICONS[post.type] || "✎"} {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
          </div>
          <h1 style={{ marginTop: 0, marginBottom: "0.15em" }}>{post.title}</h1>
          <div className="small muted font-ui pn1" style={{ paddingTop: "0.75em" }}>
            <time>{fd(post.publishedAt)}</time>
            {post.type === "article" && <> · <span className="reading-time">{rd(post.bodyMarkdown)}</span></>}
          </div>
          {post.excerpt && !isPremium && <p className="small muted" style={{ marginTop: "1em" }}>{post.excerpt}</p>}
        </div>

        <div className="wrap">
          {/* Hero image for video/music */}
          {post.coverUrl && (post.type === "video" || post.type === "music") && (
            <div style={{ marginBottom: "1.5rem", borderRadius: "6px", overflow: "hidden" }}>
              <img src={post.coverUrl} alt={post.title} style={{ width: "100%", height: "auto", display: "block", maxHeight: "400px", objectFit: "cover" }} />
            </div>
          )}

          {/* Photo type: Image gallery */}
          {post.type === "photo" && images.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              {images.map((url, i) => (
                <div key={i} style={{ overflow: "hidden", borderRadius: "6px", background: "var(--border)" }}>
                  <img src={url} alt={`${post.title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block" }} loading="lazy" />
                </div>
              ))}
            </div>
          )}

          {/* Embedded media for music/video */}
          {(post.type === "music" || post.type === "video") && links.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              {links.map((link, i) => {
                const embed = detectEmbed(link.url, link.text);
                if (embed.type !== "link") {
                  return <MediaEmbed key={i} info={embed} />;
                }
                return (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                     className="block" style={{ padding: "0.75rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", marginBottom: "0.5rem", textDecoration: "none" }}>
                    <span style={{ fontSize: "1.2em", marginRight: "0.5em" }}>{post.type === "video" ? "▶" : "♫"}</span>
                    {link.text}
                    <span style={{ float: "right", opacity: 0.5 }}>↗</span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Body content */}
          {isPremium ? (
            <>
              {post.excerpt && <p className="small muted">{post.excerpt}</p>}
              <NibgateUnlock resource={{ id: post.id, title: post.title, type: post.type, price: post.price || "0", path: `/posts/${post.slug}`, description: post.excerpt || undefined, imageUrl: post.coverUrl || undefined, tags: tagList }}>
                <div className="prose prose-neutral dark:prose-invert" style={{ lineHeight: 1.5, color: "var(--fg)" }}>
                  {post.type === "article" ? (
                    <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
                  ) : (
                    <p>{cleanBody(post.bodyMarkdown)}</p>
                  )}
                </div>
              </NibgateUnlock>
            </>
          ) : (
            <>
              {post.type !== "article" && cleanBody(post.bodyMarkdown) && (
                <div className="prose prose-neutral dark:prose-invert" style={{ lineHeight: 1.5, color: "var(--fg)", fontSize: "var(--text-base)" }}>
                  <p>{cleanBody(post.bodyMarkdown)}</p>
                </div>
              )}
              {post.type === "article" && (
                <div className="prose prose-neutral dark:prose-invert" style={{ lineHeight: 1.5, color: "var(--fg)" }}>
                  <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
                </div>
              )}
            </>
          )}
        </div>

        <div className="wrap">
          <ReputationRating resource={{ id: post.id, title: post.title, type: post.type, price: post.price || "0", path: `/posts/${post.slug}` }} />
        </div>

        {related.length > 0 && (
          <>
            <hr />
            <div className="wrap pn1">
              <p className="muted small font-ui" style={{ marginBottom: "1em" }}>More {post.type}</p>
              <ul className="list-plain">
                {related.map((p) => (
                  <li key={p.id}>
                    <Link href={`/posts/${p.slug}`} className="internal-link">
                      {p.type !== "article" && <span className="type-icon">{TYPE_ICONS[p.type]}</span>}
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </main>
    </>
  );
}
