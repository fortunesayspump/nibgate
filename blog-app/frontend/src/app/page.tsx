import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl, type BlogPost } from "@/lib/api";

async function getPosts() {
  try {
    const res = await fetch(apiUrl("/blog/posts"), { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.posts || []) as BlogPost[];
  } catch { return []; }
}

function rd(body: string) { return `${Math.max(1, Math.round(body.trim().split(/\s+/).length / 200))} min read`; }
function fd(v: string) { return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(v)); }
function yr(v: string) { return new Date(v).getFullYear().toString(); }
function ni(i: number) { return String(i + 1).padStart(2, "0"); }

export default async function HomePage() {
  const posts = await getPosts();
  const latest = posts[0];
  const rest = posts.slice(1);

  return (
    <>
      <Header />
      <main>
        <div className="wrap" style={{ maxWidth: "var(--wrap)", marginLeft: "auto", marginRight: "auto" }}>
          {latest && <>
            <p className="small muted">Latest</p>
            <Link href={`/posts/${latest.slug}`} className="plain block" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: "calc(1em + 0.2vw)", letterSpacing: "-0.015em", lineHeight: 1.3, marginTop: 0, fontWeight: 500, color: "var(--fg)" }}>
                {latest.title}
              </h2>
              <p className="small muted pb" style={{ marginBottom: "1em", color: "var(--muted)" }}>
                <time>{fd(latest.publishedAt)}</time> · <span>{rd(latest.bodyMarkdown)}</span>
              </p>
              <p className="small muted" style={{ color: "var(--muted)" }}>{latest.excerpt}</p>
            </Link>
          </>}

          <hr />

          <p className="small muted" style={{ marginBottom: "1.25em" }}>
            <Link href="/" className="muted plain">Writing</Link>
          </p>

          <ul className="list-none p-0 m-0 tabular-nums" style={{ paddingInlineStart: 0, marginLeft: 0 }}>
            {rest.map((post, i) => (
              <li key={post.id} style={{ listStyle: "none", padding: "0.15rem 0" }}>
                <Link href={`/posts/${post.slug}`} className="plain" style={{ textDecoration: "none" }}>
                  <div className="flex align-baseline" style={{ gap: 0 }}>
                    <span className="small muted" style={{ color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap", paddingRight: "2rem", fontFamily: "var(--font-ui)" }}>
                      {yr(post.publishedAt)} · {ni(i)}
                    </span>
                    <u style={{ textDecoration: "none" }} className="hover-underline">{post.title}</u>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
