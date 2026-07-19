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
  } catch { return []; }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

function readTime(body: string): string {
  return `${Math.max(1, Math.round(body.trim().split(/\s+/).length / 200))} min read`;
}

function formatYear(value: string) { return new Date(value).getFullYear().toString(); }
function postNum(index: number) { return String(index + 1).padStart(2, "0"); }

export default async function HomePage() {
  const posts = await getPosts();
  const latest = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      <Header />
      <main>
        {latest && (<>
          <p className="font-ui small muted" style={{ marginBottom: "1em" }}>Latest</p>
          <Link href={`/posts/${latest.slug}`} className="plain no-underline text-[var(--fg)] group" style={{ textDecoration: "none" }}>
            <h2 className="font-medium leading-snug mb-2" style={{ fontSize: "calc(1em + 0.2vw)", letterSpacing: "-0.015em", lineHeight: 1.3, marginTop: 0, color: "var(--fg)" }}>
              {latest.title}
            </h2>
            <p className="font-ui small muted pb" style={{ marginBottom: "1em", color: "var(--muted)" }}>
              <time>{formatDate(latest.publishedAt)}</time> · <span className="reading-time">{readTime(latest.bodyMarkdown)}</span>
            </p>
            <p className="small muted" style={{ color: "var(--muted)" }}>
              {latest.excerpt}
            </p>
          </Link>
        </>)}

        <hr className="h-px" style={{ border: 0, height: 1, margin: "4em 0", background: "var(--border)" }} />

        <p className="font-ui small" style={{ color: "var(--muted)", marginBottom: "1.25em" }}>
          <Link href="/writing" className="muted no-underline" style={{ color: "var(--muted)" }}>Writing</Link>
        </p>

        <ul className="list-none p-0 m-0 tabular-nums">
          {rest.map((post, i) => (
            <li key={post.id} style={{ padding: "0.15rem 0" }}>
              <Link href={`/posts/${post.slug}`} className="plain no-underline text-[var(--fg)] group" style={{ textDecoration: "none" }}>
                <div className="flex items-baseline" style={{ gap: "1em" }}>
                  <span className="small muted" style={{ color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {formatYear(post.publishedAt)} · {postNum(i)}
                  </span>
                  <span className="group-hover:text-[var(--accent)] transition-colors" style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}>
                    {post.title}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
