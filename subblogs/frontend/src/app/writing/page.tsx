import type { Metadata } from "next";
import Link from "next/link";
import { serverFetch } from "@/lib/server-fetch";
import { type BlogPost } from "@/lib/api";
import { fd } from "@/lib/utils";
import Header from "@/components/Header";

const TYPE = "article";
const LABEL = "Writing";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Writing",
    description: "Browse all articles and essays.",
    alternates: { canonical: "/writing" },
    openGraph: { title: "Writing", description: "Browse all articles and essays." },
  };
}

export default async function WritingPage() {
  const data = await serverFetch<{ posts: BlogPost[]; total: number }>(`/blog/posts?type=${TYPE}&limit=50`);
  const posts = data?.posts || [];

  return (
    <>
      <Header />
      <main>
        <div className="wrap" style={{ maxWidth: "var(--wrap-normal)", margin: "0 auto" }}>
          {posts.length === 0 ? <p className="muted">No posts yet.</p> : (
            <ul className="list-plain tabular-nums">
              {posts.map((post) => (
                <li key={post.id} style={{ marginBottom: "0.5em" }}>
                  <Link href={`/writing/${post.slug}`} className="internal-link plain">
                    <div style={{ display: "flex", alignItems: "baseline" }}>
                      <span className="muted ppr flex-shrink small mh nowrap font-ui">{fd(post.publishedAt)}</span>
                      <span className="type-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></span>
                      <u>{post.title}</u>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
