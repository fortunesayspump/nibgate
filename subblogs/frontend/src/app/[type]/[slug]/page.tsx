import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import MediaEmbed from "@/components/MediaEmbed";
import NibgateUnlock from "@/components/NibgateUnlock";
import ReputationRating from "@/components/ReputationRating";
import DocumentContent from "@/components/DocumentContent";
import { serverFetch } from "@/lib/server-fetch";
import { type BlogPost } from "@/lib/api";
import { fd, rd } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = { article: "Writing", photo: "Photos", music: "Music", video: "Video", document: "Docs" };
const TYPE_ICONS: Record<string, string> = { article: "✎", photo: "▣", music: "♫", video: "▶", document: "▤" };

async function siteOrigin() {
  try {
    const h = await headers();
    const host = h.get("host") || "nibgate.xyz";
    return `https://${host}`;
  } catch { return "https://nibgate.xyz"; }
}

function jsonLd(post: BlogPost, origin: string) {
  const typePath: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video", document: "docs" };
  const url = `${origin}/${typePath[post.type] || "posts"}/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || '',
    image: post.coverUrl || undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: { "@type": "Person", name: post.author?.name || "Author" },
    publisher: { "@type": "Organization", name: "Nibgate", url: "https://nibgate.xyz" },
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

function detectEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (yt) return { type: "youtube" as const, videoId: yt[1], embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
  return { type: "unknown" as const, embedUrl: null };
}

function cleanBody(md: string) {
  return md.replace(/<[^>]*>/g, "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/[#*`\[\]()>-]/g, "").trim().slice(0, 300);
}

function resolveEmbeds(md: string, postId: string) {
  return md.replace(/nibgate-embed:\/\/(\d+)/g, (_m, idx) => `/api/nibgate/media/${postId}/photo?index=${idx}`);
}

function postHref(post: { type: string; slug: string }) {
  const m: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video", document: "docs" };
  return `/${m[post.type] || "posts"}/${post.slug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ type: string; slug: string }> }): Promise<any> {
  const { type, slug } = await params;
  try {
    const data = await serverFetch<{ success: boolean; post: BlogPost }>(`/blog/posts/${slug}`, { next: { revalidate: 60 } });
    const post = data?.post;
    if (!post) return {};
    const origin = await siteOrigin();
    const typePath: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video", document: "docs" };
    const path = `/${type}/${slug}`;
    const resourcePath = `/${typePath[post.type] || "posts"}/${post.slug}`;
    return {
      title: post.title,
      description: post.excerpt || '',
      metadataBase: new URL(origin),
      alternates: { canonical: path },
      openGraph: {
        title: post.title,
        description: post.excerpt || '',
        url: `${origin}${path}`,
        type: 'article',
        publishedTime: post.publishedAt,
        images: post.coverUrl ? [{ url: post.coverUrl }] : [],
      },
      twitter: {
        card: 'summary_large_image',
        title: post.title,
        description: post.excerpt || '',
        images: post.coverUrl ? [post.coverUrl] : [],
      },
      other: {
        'nibgate:resource-id': post.id,
        'nibgate:title': post.title,
        'nibgate:type': post.type,
        'nibgate:price': post.price || '',
        'nibgate:path': resourcePath,
        'nibgate:image': post.coverUrl || '',
        'nibgate:access': `${origin}/api/nibgate/access?path=${encodeURIComponent(resourcePath)}`,
        'nibgate:manifest': `${origin}/api/nibgate/manifest?path=${encodeURIComponent(resourcePath)}`,
      },
    };
  } catch { return {}; }
}

export default async function PostPage({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  const data = await serverFetch<{ success: boolean; post: BlogPost }>(`/blog/posts/${slug}`, { next: { revalidate: 60 } });
  const post = data?.post;
  if (!post) notFound();

  const typeMap: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video", document: "docs" };
  if (typeMap[post.type] !== type) notFound();

  const postBody = post.bodyMarkdown || "";
  const isPremium = post.price && Number(post.price) > 0;

  let images: { url: string; caption?: string }[] = [];
  if (post.type === "photo" && post.media) {
    try {
      const items = JSON.parse(post.media);
      if (Array.isArray(items)) {
        images = items.map((i: any, idx: number) => {
          if (typeof i === "string") return { url: i, caption: "" };
          if (i?.storageRef) return { url: `/api/nibgate/media/${post.id}/photo?index=${idx}`, caption: i.caption || "" };
          return { url: i.url, caption: i.caption || "" };
        });
      }
    } catch {}
  }

  const relatedData = await serverFetch<{ success: boolean; posts: BlogPost[] }>(`/blog/posts?type=${post.type}&limit=6`, { next: { revalidate: 60 } });
  const related = (relatedData?.posts || []).filter((p) => p.id !== post.id).slice(0, 5);
  const origin = await siteOrigin();
  const resourcePath = `/${typeMap[post.type] || "posts"}/${post.slug}`;
  const manifestUrl = `${origin}/api/nibgate/manifest?path=${encodeURIComponent(resourcePath)}`;
  const accessUrl = `${origin}/api/nibgate/access?path=${encodeURIComponent(resourcePath)}`;

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(post, origin)) }} />
      <article data-nibgate-resource data-nibgate-id={post.id} data-nibgate-title={post.title} data-nibgate-type={post.type} data-nibgate-price={post.price || ""} data-nibgate-path={resourcePath} data-nibgate-image={post.coverUrl || ""} data-nibgate-access={accessUrl} data-nibgate-manifest={manifestUrl}>
        <link rel="alternate" type="application/json" href={manifestUrl} />
        <div className="wrap" style={{ maxWidth: "var(--wrap-post)", margin: "0 auto" }}>
          <div className="small muted font-ui" style={{ marginBottom: "0.5em" }}>
            {TYPE_ICONS[post.type] || "✎"} {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
          </div>
          <h1 style={{ marginTop: 0, marginBottom: "0.15em" }}>{post.title}</h1>
          <div className="small muted font-ui pn1" style={{ paddingTop: "0.75em" }}>
            <time>{fd(post.publishedAt)}</time>
            {post.type === "article" && <> · <span className="reading-time">{rd(postBody)}</span></>}
          </div>
          {post.excerpt && (post.type === "document" || !isPremium) && <p className="small muted" style={{ marginTop: "1em", marginBottom: "2em" }}>{post.excerpt}</p>}
        </div>

        <div className="wrap">
          {post.coverUrl && post.type !== "video" && (
            <a href={post.coverUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: "2rem", marginTop: "1rem", borderRadius: "6px", overflow: "hidden" }}>
              <img src={post.coverUrl} alt={post.title} style={{ width: "100%", height: "auto", display: "block", maxHeight: "400px", objectFit: "cover" }} />
            </a>
          )}

          {post.type === "video" && !isPremium && (() => {
            const src = post.videoStorageRef ? `/api/nibgate/media/${post.id}/video` : post.videoUrl;
            if (!src) return null;
            const embed = detectEmbed(src);
            if (embed.type === "youtube") {
              return (
                <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px", marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                  <iframe src={embed.embedUrl || src} title={post.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
                </div>
              );
            }
            return (
              <video controls src={src} style={{ width: "100%", borderRadius: "6px", display: "block", background: "#000", marginTop: "1.5rem", marginBottom: "1.5rem" }} playsInline />
            );
          })()}

          {post.type === "photo" && !isPremium && images.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
              {images.map((item, i) => (
                <div key={i}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <img src={item.url} alt={item.caption || `${post.title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px" }} loading="lazy" />
                  </a>
                  {item.caption && <p className="small muted" style={{ marginTop: "0.3em" }}>{item.caption}</p>}
                </div>
              ))}
            </div>
          )}

          {post.type === "music" && !isPremium && post.audioStorageRef && (
            <div style={{ marginBottom: "1.5rem" }}>
              <audio controls src={`/api/nibgate/media/${post.id}/audio`} style={{ width: "100%" }} />
            </div>
          )}

          {post.type === "document" ? (
            <DocumentContent
              postId={post.id}
              title={post.title}
              name={post.documentName}
              size={post.documentSize}
              contentType={post.documentContentType}
              documentUrl={post.documentUrl}
              isPaid={!!isPremium}
              resource={{ id: post.id, title: post.title, type: post.type, price: post.price || "0", path: `/${TYPE_LABELS[post.type]?.toLowerCase() || "posts"}/${post.slug}` }}
            />
          ) : isPremium ? (
            <NibgateUnlock resource={{ id: post.id, title: post.title, type: post.type, price: post.price || "0", path: `/${TYPE_LABELS[post.type]?.toLowerCase() || "posts"}/${post.slug}` }} />
          ) : post.type === "article" ? (
            <div className="prose prose-neutral dark:prose-invert">
              <ReactMarkdown>{resolveEmbeds(post.bodyMarkdown, post.id)}</ReactMarkdown>
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
                      <span className="type-icon">{TYPE_ICONS[p.type]}</span>
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
