import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NibgateUnlock from "@/components/NibgateUnlock";
import { apiUrl, type BlogPost } from "@/lib/api";

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

async function getAdj(slug: string) {
  try {
    const r = await fetch(apiUrl("/blog/posts"), { next: { revalidate: 60 } });
    if (!r.ok) return { p: null, n: null };
    const d = await r.json();
    const posts = (d.posts || []) as BlogPost[];
    const i = posts.findIndex((p: BlogPost) => p.slug === slug);
    if (i === -1) return { p: null, n: null };
    return { p: i < posts.length - 1 ? posts[i + 1] : null, n: i > 0 ? posts[i - 1] : null };
  } catch { return { p: null, n: null }; }
}

type PW = BlogPost & { price?: string };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = (await getPost(slug)) as PW | null;
  if (!post) notFound();
  const { p: prev, n: next } = await getAdj(slug);
  const isPremium = Boolean(post.price && post.price !== "0");

  return (
    <>
      <Header />
      <main>
        <article style={{ maxWidth: "var(--wrap)", marginLeft: "auto", marginRight: "auto" }}>
          <header>
            <Link href="/" className="small muted plain" style={{ color: "var(--muted)" }}>&larr; Back</Link>
            <h1 style={{ fontWeight: 500, fontSize: "calc(1.35em + 0.55vw)", letterSpacing: "-0.02em", lineHeight: 1.25, marginTop: "1.5em", marginBottom: ".25em" }}>
              {post.title}
            </h1>
            <p className="small muted pb" style={{ color: "var(--muted)", marginBottom: "1em" }}>
              <time>{fd(post.publishedAt)}</time> · <span>{rd(post.bodyMarkdown)}</span>
            </p>
          </header>

          {post.coverUrl && (
            <div style={{ margin: "1.5em 0" }}>
              <img src={post.coverUrl} alt="" style={{ maxWidth: "100%", display: "block", borderRadius: 6 }} />
            </div>
          )}

          {isPremium ? (
            <p className="small muted" style={{ fontStyle: "italic" }}>Premium content — unlock below.</p>
          ) : (
            <div className="prose prose-neutral dark:prose-invert" style={{ maxWidth: "var(--wrap)", lineHeight: 1.5, color: "var(--fg)" }}>
              <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
            </div>
          )}
        </article>

        {isPremium && post.price && (
          <NibgateUnlock resource={{ id: post.slug, title: post.title, type: "article", price: post.price, path: `/posts/${post.slug}` }} />
        )}

        <nav style={{ marginTop: "4em", maxWidth: "var(--wrap)", marginLeft: "auto", marginRight: "auto", borderTop: "1px solid var(--border)", paddingTop: "1em" }}>
          <div className="flex" style={{ gap: "1em" }}>
            {prev ? (
              <Link href={`/posts/${prev.slug}`} className="plain" style={{ flex: 1 }}>
                <span className="smaller muted">&larr; Previous</span>
                <p className="small muted" style={{ marginTop: ".25em" }}>{prev.title}</p>
              </Link>
            ) : <div style={{ flex: 1 }} />}
            {next ? (
              <Link href={`/posts/${next.slug}`} className="plain" style={{ flex: 1, textAlign: "right" }}>
                <span className="smaller muted">Next &rarr;</span>
                <p className="small muted" style={{ marginTop: ".25em" }}>{next.title}</p>
              </Link>
            ) : <div style={{ flex: 1 }} />}
          </div>
        </nav>
      </main>
      <Footer />
    </>
  );
}
