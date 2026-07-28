"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiAuthFetch, type BlogPost } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = { article: "#7c9a6d", photo: "#8b7e74", music: "#6d8a9a", video: "#9a6d8a" };

function Icon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
    plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
    edit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
    article: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    photo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
    music: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    video: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
    published: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    draft: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  };
  return <>{icons[name] || null}</>;
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${TYPE_COLORS[type] || "#888"}20`, color: TYPE_COLORS[type] || "#888" }}>
      <Icon name={type} />{type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPub = status === "published";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: isPub ? "#7c9a6d20" : "#c4a06020", color: isPub ? "#7c9a6d" : "#c4a060" }}>
      <Icon name={isPub ? "published" : "draft"} />{status}
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
              <Icon name="settings" />
            </Link>
            <Link href="/admin/posts/new" className="no-underline inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }} title="New Post">
              <Icon name="plus" />
            </Link>
            <button onClick={handleLogout} className="inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)", background: "transparent" }} title="Sign Out">
              <Icon name="logout" />
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
                    <Icon name="edit" />
                  </Link>
                  <button onClick={() => handleDelete(post.id)} className="inline-flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer" style={{ borderColor: "#c448", color: "#c44" }} title="Delete">
                    <Icon name="trash" />
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
