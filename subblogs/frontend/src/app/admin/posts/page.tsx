"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiAuthFetch, type BlogPost } from "@/lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

const TYPE_COLORS: Record<string, string> = {
  article: "#7c9a6d",
  photo: "#8b7e74",
  music: "#6d8a9a",
  video: "#9a6d8a",
};

export default function AdminPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/admin/login"); return; }
    apiAuthFetch<{ success: boolean; posts: BlogPost[] }>("/blog/admin/posts")
      .then((data) => setPosts(data.posts))
      .catch(() => router.push("/admin/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this post?")) return;
    try {
      await apiAuthFetch(`/blog/admin/posts/${id}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    router.push("/admin/login");
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <a href="/" className="btn-ghost no-underline inline-flex items-center gap-1">
          &larr; Back to blog
        </a>
        <div className="flex items-center justify-between mt-6 mb-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Posts</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{posts.length} post{posts.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/settings" className="btn-secondary no-underline text-xs" style={{ padding: "6px 12px" }}>
              Settings
            </Link>
            <Link href="/admin/posts/new" className="btn-primary no-underline text-xs" style={{ padding: "6px 12px" }}>
              New Post
            </Link>
            <button onClick={handleLogout} className="btn-secondary text-xs" style={{ padding: "6px 12px" }}>
              Sign Out
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-px">
          {posts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: "var(--muted)" }}>No posts yet.</p>
              <Link href="/admin/posts/new" className="btn-ghost no-underline inline-flex mt-2 text-xs">
                Create your first post
              </Link>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-3 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium truncate">{post.title}</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase" style={{ background: `${TYPE_COLORS[post.type]}20`, color: TYPE_COLORS[post.type] }}>{post.type}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{
                      background: post.status === "published" ? "#7c9a6d20" : "#c4a06020",
                      color: post.status === "published" ? "#7c9a6d" : "#c4a060",
                    }}>
                      {post.status}
                    </span>
                  </div>
                  {post.excerpt && <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>{post.excerpt}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/admin/posts/${post.id}`} className="no-underline text-xs font-medium px-2.5 py-1.5 rounded-md border" style={{ color: "var(--fg)", borderColor: "var(--border)" }}>
                    Edit
                  </Link>
                  <button onClick={() => handleDelete(post.id)} className="text-xs font-medium px-2.5 py-1.5 rounded-md border cursor-pointer" style={{ color: "#c44", borderColor: "#c448" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
