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

function readTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

async function getPost(slug: string) {
  try {
    const res = await fetch(apiUrl(`/blog/posts/${slug}`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.post as BlogPost;
  } catch { return null; }
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
  } catch { return { prev: null, next: null }; }
}

type PostWithPrice = BlogPost & { price?: string };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = (await getPost(slug)) as PostWithPrice | null;
  if (!post) notFound();

  const { prev, next } = await getAdjacentPosts(slug);
  const isPremium = Boolean(post.price && post.price !== "0");

  return (
    <>
      <Header />
      <main>
        <article>
          <header className="mb-10">
            <Link href="/" className="text-sm text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
              &larr; Back
            </Link>
            <h1 className="text-2xl font-medium leading-tight mt-6 mb-3">{post.title}</h1>
            <p className="text-sm text-[var(--muted)]">
              {formatDate(post.publishedAt)} · {readTime(post.bodyMarkdown)}
            </p>
            {isPremium && <p className="text-sm text-[var(--accent)] mt-2 font-medium">{post.price} USDC</p>}
          </header>

          {post.coverUrl && (
            <div className="mb-8 -mx-6">
              <img src={post.coverUrl} alt="" className="w-full object-cover max-h-72" />
            </div>
          )}

          {isPremium ? (
            <p className="text-[var(--muted)] italic">Premium content — unlock below to read the full article.</p>
          ) : (
            <div className="prose prose-neutral dark:prose-invert prose-headings:font-medium prose-headings:text-[var(--fg)] prose-p:text-[var(--fg)] prose-p:leading-relaxed prose-a:text-[var(--fg)] prose-a:underline prose-a:underline-offset-2 prose-a:decoration-[var(--border)] prose-a:font-normal prose-strong:text-[var(--fg)] prose-code:text-sm prose-pre:text-sm prose-blockquote:border-[var(--accent)] prose-blockquote:text-[var(--muted)] max-w-none text-[1.8rem] leading-relaxed">
              <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
            </div>
          )}
        </article>

        {isPremium && post.price && (
          <NibgateUnlock resource={{
            id: post.slug, title: post.title, type: "article", price: post.price, path: `/posts/${post.slug}`,
          }} />
        )}

        <nav className="mt-14 flex flex-col gap-4 border-t border-[var(--border)] pt-6 sm:flex-row sm:justify-between">
          {prev ? (
            <Link href={`/posts/${prev.slug}`} className="group no-underline flex-1">
              <span className="text-xs text-[var(--faint)]">&larr; Previous</span>
              <p className="text-sm text-[var(--fg)] mt-1 group-hover:text-[var(--accent)] transition-colors">{prev.title}</p>
            </Link>
          ) : <div />}
          {next ? (
            <Link href={`/posts/${next.slug}`} className="group no-underline flex-1 text-right">
              <span className="text-xs text-[var(--faint)]">Next &rarr;</span>
              <p className="text-sm text-[var(--fg)] mt-1 group-hover:text-[var(--accent)] transition-colors">{next.title}</p>
            </Link>
          ) : <div />}
        </nav>
      </main>
      <Footer />
    </>
  );
}
