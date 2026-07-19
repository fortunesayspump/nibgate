import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl, type BlogPost } from "@/lib/api";

async function getPosts() {
  try {
    const res = await fetch(apiUrl("/blog/posts"), { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.posts || []) as BlogPost[];
  } catch {
    return [];
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

function readTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

function formatYear(value: string) {
  return new Date(value).getFullYear().toString();
}

function postNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export default async function HomePage() {
  const posts = await getPosts();
  const latest = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="wrap" style={{ maxWidth: "680px", margin: "0 auto" }}>
      <Header />
      <main>
        {latest && (
          <div className="mb-10">
            <p className="text-xs text-[var(--muted)] font-medium mb-3">Latest</p>
            <Link href={`/posts/${latest.slug}`} className="no-underline text-[var(--fg)] group">
              <h2 className="text-xl font-medium leading-snug mb-2 group-hover:text-[var(--accent)] transition-colors">{latest.title}</h2>
              <p className="text-xs text-[var(--muted)] mb-2">
                <time>{formatDate(latest.publishedAt)}</time> · <span>{readTime(latest.bodyMarkdown)}</span>
              </p>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                {latest.excerpt}
              </p>
            </Link>
          </div>
        )}

        <hr className="border-0 h-px bg-[var(--border)] my-8" />

        <p className="text-xs text-[var(--muted)] font-medium mb-5">Writing</p>

        <ul className="list-none p-0 m-0">
          {rest.map((post, i) => (
            <li key={post.id} className="mb-3">
              <Link href={`/posts/${post.slug}`} className="no-underline text-[var(--fg)] block py-1 group">
                <div className="flex items-baseline gap-3 text-sm">
                  <span className="text-[var(--faint)] tabular-nums shrink-0 font-medium" style={{ letterSpacing: '0' }}>
                    {formatYear(post.publishedAt)} · {postNumber(i)}
                  </span>
                  <span className="group-hover:text-[var(--accent)] transition-colors">
                    {post.title}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </div>
  );
}
