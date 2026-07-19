"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiAuthFetch, type BlogPost } from "@/lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

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
    return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">Loading...</div>;
  }

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-lg">
        <a href="/" className="text-xs text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
          &larr; Back to blog
        </a>
        <div className="flex items-center justify-between mt-6 mb-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Posts</h1>
            <p className="text-xs text-[var(--muted)] mt-0.5">{posts.length} post{posts.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/settings" className="border border-[var(--border)] px-3 py-2 rounded-md text-xs text-[var(--muted)] hover:bg-[var(--surface)] transition-all no-underline font-medium">
              Settings
            </Link>
            <Link href="/admin/posts/new" className="bg-[var(--accent-soft)] border border-[var(--accent)] text-xs font-semibold px-3 py-2 rounded-md hover:bg-[var(--accent)] hover:text-white transition-all no-underline text-[var(--fg)]">
              New Post
            </Link>
            <button onClick={handleLogout} className="border border-[var(--border)] px-3 py-2 rounded-md text-xs text-[var(--muted)] hover:bg-[var(--surface)] transition-all cursor-pointer font-medium">
              Sign Out
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-px">
          {posts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--muted)]">No posts yet.</p>
              <Link href="/admin/posts/new" className="text-xs text-[var(--muted)] underline underline-offset-2 mt-2 inline-block">
                Create your first post
              </Link>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-3 py-3 border-b border-[var(--border)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium truncate">{post.title}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      post.status === "published"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {post.status}
                    </span>
                  </div>
                  {post.excerpt && <p className="text-xs text-[var(--muted)] truncate mt-0.5">{post.excerpt}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/admin/posts/${post.id}`} className="px-2.5 py-1.5 text-xs border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors no-underline text-[var(--fg)] font-medium">
                    Edit
                  </Link>
                  <button onClick={() => handleDelete(post.id)} className="px-2.5 py-1.5 text-xs border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer font-medium">
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
