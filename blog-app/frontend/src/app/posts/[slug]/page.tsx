import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl, type BlogPost } from "@/lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

function readTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

async function getPost(slug: string) {
  try {
    const res = await fetch(apiUrl(`/blog/posts/${slug}`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.post as BlogPost;
  } catch {
    return null;
  }
}

async function getAdjacentPosts(currentSlug: string) {
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
  } catch {
    return { prev: null, next: null };
  }
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const { prev, next } = await getAdjacentPosts(slug);

  return (
    <>
      <Header />
      <main>
        <article>
          <header className="mb-10">
            <Link href="/" className="text-xs text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
              &larr; Back to posts
            </Link>
            <div className="flex items-center gap-2 text-xs text-[var(--muted)] mt-6 mb-4">
              <span>{formatDate(post.publishedAt)}</span>
              <span className="opacity-30">&middot;</span>
              <span>{readTime(post.bodyMarkdown)}</span>
              <span className="opacity-30">&middot;</span>
              <span>{post.tag || "General"}</span>
            </div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{post.excerpt}</p>
            )}
          </header>

          {post.coverUrl && (
            <div className="mb-10 -mx-6">
              <img src={post.coverUrl} alt="" className="w-full object-cover max-h-80 rounded-lg" />
            </div>
          )}

          <div className="prose prose-neutral prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[var(--fg)] prose-p:text-[var(--muted)] prose-p:leading-7 prose-a:text-[var(--fg)] prose-a:underline prose-a:underline-offset-2 prose-a:decoration-[var(--accent)] prose-a:font-normal prose-strong:text-[var(--fg)] prose-code:bg-[var(--accent-soft)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-[#1a1a18] prose-pre:text-[#e4e4e0] prose-pre:border-0 prose-pre:rounded-lg prose-blockquote:border-[var(--accent)] prose-blockquote:text-[var(--muted)] prose-blockquote:font-normal prose-li:text-[var(--muted)] prose-li:leading-7 prose-hr:border-[var(--border)] max-w-none text-[15px] leading-7">
            <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
          </div>
        </article>

        <nav className="mt-14 flex flex-col gap-4 border-t border-[var(--border)] pt-6 sm:flex-row sm:justify-between">
          {prev ? (
            <Link href={`/posts/${prev.slug}`} className="group no-underline flex-1">
              <span className="text-xs text-[var(--muted)]">&larr; Previous</span>
              <p className="text-sm font-medium text-[var(--fg)] mt-1 group-hover:underline decoration-[var(--accent)] underline-offset-2">{prev.title}</p>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link href={`/posts/${next.slug}`} className="group no-underline flex-1 text-right">
              <span className="text-xs text-[var(--muted)]">Next &rarr;</span>
              <p className="text-sm font-medium text-[var(--fg)] mt-1 group-hover:underline decoration-[var(--accent)] underline-offset-2">{next.title}</p>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      </main>
      <Footer />
    </>
  );
}
