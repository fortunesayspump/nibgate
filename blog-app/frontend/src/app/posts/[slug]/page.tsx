import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NibgateUnlock from "@/components/NibgateUnlock";
import { apiUrl, type BlogPost } from "@/lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}
function readTime(body: string) {
  return `${Math.max(1, Math.round(body.trim().split(/\s+/).length / 200))} min read`;
}

async function getPost(slug: string) {
  try {
    const res = await fetch(apiUrl(`/blog/posts/${slug}`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.post as BlogPost;
  } catch { return null; }
}

async function getAdjacent(currentSlug: string) {
  try {
    const res = await fetch(apiUrl("/blog/posts"), { next: { revalidate: 60 } });
    if (!res.ok) return { prev: null, next: null };
    const data = await res.json();
    const posts = (data.posts || []) as BlogPost[];
    const idx = posts.findIndex((p: BlogPost) => p.slug === currentSlug);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx < posts.length - 1 ? posts[idx + 1] : null,
      next: idx > 0 ? posts[idx - 1] : null,
    };
  } catch { return { prev: null, next: null }; }
}

type PostWP = BlogPost & { price?: string };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = (await getPost(slug)) as PostWP | null;
  if (!post) notFound();

  const { prev, next } = await getAdjacent(slug);
  const isPremium = Boolean(post.price && post.price !== "0");

  return (
    <>
      <Header />
      <main>
        <article>
          <header>
            <Link href="/" className="small muted no-underline hover:text-[var(--fg)]" style={{ color: "var(--muted)" }}>
              &larr; Back
            </Link>
            <h1 className="font-medium leading-tight mt-6 mb-2" style={{ fontSize: "calc(1.35em + 0.55vw)", letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              {post.title}
            </h1>
            <p className="font-ui small muted" style={{ color: "var(--muted)", marginBottom: "1em" }}>
              <time>{formatDate(post.publishedAt)}</time> · <span>{readTime(post.bodyMarkdown)}</span>
            </p>
            {isPremium && <p className="small" style={{ color: "var(--accent)", fontWeight: 500 }}>{post.price} USDC</p>}
          </header>

          {post.coverUrl && (
            <div style={{ margin: "1.5em 0" }}>
              <img src={post.coverUrl} alt="" className="w-full" style={{ maxHeight: "400px", objectFit: "cover", borderRadius: "6px" }} />
            </div>
          )}

          {isPremium ? (
            <p className="small muted" style={{ fontStyle: "italic" }}>Premium content — unlock below to read the full article.</p>
          ) : (
            <div className="prose prose-neutral dark:prose-invert"
              style={{ maxWidth: "37em", fontSize: "1em", lineHeight: 1.5, color: "var(--fg)" }}>
              <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
            </div>
          )}
        </article>

        {isPremium && post.price && (
          <NibgateUnlock resource={{
            id: post.slug, title: post.title, type: "article", price: post.price, path: `/posts/${post.slug}`,
          }} />
        )}

        <nav className="flex flex-col sm:flex-row sm:justify-between" style={{ marginTop: "4em", gap: "1em", borderTop: "1px solid var(--border)", paddingTop: "1em" }}>
          {prev ? (
            <Link href={`/posts/${prev.slug}`} className="group no-underline flex-1">
              <span className="smaller muted" style={{ color: "var(--muted)" }}>&larr; Previous</span>
              <p className="small mt-1" style={{ color: "var(--fg)" }}>{prev.title}</p>
            </Link>
          ) : <div />}
          {next ? (
            <Link href={`/posts/${next.slug}`} className="group no-underline flex-1 text-right">
              <span className="smaller muted" style={{ color: "var(--muted)" }}>Next &rarr;</span>
              <p className="small mt-1" style={{ color: "var(--fg)" }}>{next.title}</p>
            </Link>
          ) : <div />}
        </nav>
      </main>
      <Footer />
    </>
  );
}
