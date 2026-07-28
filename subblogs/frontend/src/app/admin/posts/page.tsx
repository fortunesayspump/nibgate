"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiAuthFetch, type BlogPost } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = { article: "#7c9a6d", photo: "#8b7e74", music: "#6d8a9a", video: "#9a6d8a" };

import { FiSettings, FiPlus, FiLogOut, FiEdit2, FiTrash2, FiFileText, FiImage, FiMusic, FiVideo, FiCheckCircle, FiClock } from "react-icons/fi";

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = { article: <FiFileText size={14} />, photo: <FiImage size={14} />, music: <FiMusic size={14} />, video: <FiVideo size={14} /> };
  return <>{icons[type] || null}</>;
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${TYPE_COLORS[type] || "#888"}20`, color: TYPE_COLORS[type] || "#888" }}>
      <TypeIcon type={type} />{type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPub = status === "published";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: isPub ? "#7c9a6d20" : "#c4a06020", color: isPub ? "#7c9a6d" : "#c4a060" }}>
      {isPub ? <FiCheckCircle size={12} /> : <FiClock size={12} />}{status}
    </span>
  );
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
    return <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <a href="/" className="btn-ghost no-underline inline-flex items-center gap-1 text-xs">&larr; Back to blog</a>
        <div className="flex items-center justify-between mt-5 mb-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Posts</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{posts.length} post{posts.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/admin/settings" className="no-underline inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)" }} title="Settings">
              <FiSettings size={18} />
            </Link>
            <Link href="/admin/posts/new" className="no-underline inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }} title="New Post">
              <FiPlus size={18} />
            </Link>
            <button onClick={handleLogout} className="inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)", background: "transparent" }} title="Sign Out">
              <FiLogOut size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-px">
          {posts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: "var(--muted)" }}>No posts yet.</p>
              <Link href="/admin/posts/new" className="btn-ghost no-underline inline-flex mt-2 text-xs">Create your first post</Link>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-2 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-sm font-medium truncate max-w-[180px] sm:max-w-none">{post.title}</h2>
                    <TypeBadge type={post.type} />
                    <StatusBadge status={post.status} />
                  </div>
                  {post.excerpt && <p className="text-xs truncate mt-0.5 hidden sm:block" style={{ color: "var(--muted)" }}>{post.excerpt}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link href={`/admin/posts/${post.id}`} className="no-underline inline-flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)" }} title="Edit">
                    <FiEdit2 size={15} />
                  </Link>
                  <button onClick={() => handleDelete(post.id)} className="inline-flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer" style={{ borderColor: "#c448", color: "#c44" }} title="Delete">
                    <FiTrash2 size={15} />
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
