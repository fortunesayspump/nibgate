import Link from "next/link";
import { serverFetch } from "@/lib/server-fetch";
import { type BlogPost } from "@/lib/api";
import { fd } from "@/lib/utils";
import Header from "@/components/Header";

const TYPE = "photo";
const LABEL = "Photos";

export default async function PhotosPage() {
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
                  <Link href={`/photos/${post.slug}`} className="internal-link plain">
                    <div style={{ display: "flex", alignItems: "baseline" }}>
                      <span className="muted ppr flex-shrink small mh nowrap font-ui">{fd(post.publishedAt)}</span>
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
