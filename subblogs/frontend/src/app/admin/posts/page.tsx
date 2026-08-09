"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiAuthFetch, apiFetch, type BlogPost } from "@/lib/api";
import NotificationsBell from "@/components/NotificationsBell";

const TYPE_COLORS: Record<string, string> = { article: "#7c9a6d", photo: "#8b7e74", music: "#6d8a9a", video: "#9a6d8a", document: "#6d7a9a" };
const SECTION: Record<string, string> = { article: "writing", photo: "photos", music: "music", video: "video", document: "docs" };

import { FiSliders, FiPlus, FiLogOut, FiEdit2, FiTrash2, FiFileText, FiImage, FiMusic, FiVideo, FiCheckCircle, FiBarChart2, FiX } from "react-icons/fi";

type Receipt = { id: string; payerWallet: string | null; amount: number; currency: string; timestamp: string; txHash: string | null; provider: string | null };
type PostStats = { url: string; title: string; views: number; unlocks: number; payments: number; ratings: number; revenue: number; receipts: Receipt[] };

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = { article: <FiFileText size={14} />, photo: <FiImage size={14} />, music: <FiMusic size={14} />, video: <FiVideo size={14} />, document: <FiFileText size={14} /> };
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
  const isDraft = status === "draft";
  const color = isDraft ? "#6d8a9a" : "#7c9a6d";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${color}20`, color }}>
      {isDraft ? <FiEdit2 size={12} /> : <FiCheckCircle size={12} />}{status}
    </span>
  );
}

function shortAddr(a?: string | null) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function fmtUsd(v: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-md border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="text-base font-semibold" style={{ color: accent || "var(--fg)" }}>{value}</span>
    </div>
  );
}

function StatsSheet({ post, stats, href, onClose }: { post: BlogPost; stats?: PostStats; href: string; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const revenue = stats?.revenue || 0;
  const paid = !!post.price && post.price !== "0";
  const receipts = stats?.receipts || [];

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: "480px", maxHeight: "80vh", overflowY: "auto", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--bg)", padding: "20px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm font-semibold truncate">{post.title}</h2>
              <TypeBadge type={post.type} />
              <StatusBadge status={post.status} />
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {post.status === "published"
                ? <>Published {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"} · <a href={href} className="no-underline" style={{ color: "var(--accent)" }}>View post ↗</a></>
                : <>Draft · updated {new Date(post.updatedAt).toLocaleDateString()}</>}
            </p>
          </div>
          <button onClick={onClose} className="inline-flex items-center justify-center w-7 h-7 rounded-md border shrink-0" style={{ borderColor: "var(--border)", color: "var(--muted)" }} title="Close">
            <FiX size={15} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatCard label="Unlocks" value={String(stats?.unlocks ?? 0)} />
          <StatCard label="Revenue" value={`${fmtUsd(revenue)} USDC`} accent={revenue > 0 ? "#7c9a6d" : undefined} />
          <StatCard label="Price" value={paid ? `${fmtUsd(Number(post.price))} USDC` : "Free"} />
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Receipts</span>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>{receipts.length} total</span>
        </div>
        {receipts.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--muted)" }}>No unlocks yet.</p>
        ) : (
          <div className="flex flex-col">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{shortAddr(r.payerWallet)}</p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                    {new Date(r.timestamp).toLocaleString()}{r.txHash ? ` · ${shortAddr(r.txHash)}` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold shrink-0" style={{ color: r.amount > 0 ? "#7c9a6d" : "var(--muted)" }}>
                  {r.amount > 0 ? `${fmtUsd(r.amount)} USDC` : "Free"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function AdminPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"published" | "drafts">("published");
  const [statsByUrl, setStatsByUrl] = useState<Record<string, PostStats>>({});
  const [domain, setDomain] = useState<string>("");
  const [statsFor, setStatsFor] = useState<BlogPost | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/admin/login"); return; }
    apiAuthFetch<{ success: boolean; posts: BlogPost[] }>("/blog/admin/posts")
      .then((data) => setPosts(data.posts))
      .catch(() => router.push("/admin/login"))
      .finally(() => setLoading(false));
    apiFetch<{ success: boolean; site: { subdomain: string } }>("/site")
      .then((data) => setDomain(`${data.site.subdomain}.nibgate.xyz`))
      .catch(() => {});
    apiAuthFetch<{ success: boolean; stats: Record<string, PostStats> }>("/blog/admin/posts/stats")
      .then((data) => setStatsByUrl(data.stats || {}))
      .catch(() => {});
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

  function postStats(post: BlogPost): PostStats | undefined {
    const section = SECTION[post.type] || "posts";
    return statsByUrl[`https://${domain}/${section}/${post.slug}`] || statsByUrl[`/${section}/${post.slug}`];
  }

  function postHref(post: BlogPost) {
    return `/${SECTION[post.type] || "posts"}/${post.slug}`;
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  const published = posts.filter((p) => p.status === "published");
  const drafts = posts.filter((p) => p.status === "draft");
  const visible = view === "drafts" ? drafts : published;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <a href="/" className="btn-ghost no-underline inline-flex items-center gap-1 text-xs">&larr; Back to blog</a>
        <div className="flex items-center justify-between mt-5 mb-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Posts</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{published.length} post{published.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationsBell />
            <Link href="/admin/settings" className="no-underline inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)" }} title="Settings">
              <FiSliders size={18} />
            </Link>
            <Link href="/admin/posts/new" className="no-underline inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }} title="New Post">
              <FiPlus size={18} />
            </Link>
            <button onClick={handleLogout} className="inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)", background: "transparent" }} title="Sign Out">
              <FiLogOut size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-lg border mb-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <button
            onClick={() => setView("published")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md cursor-pointer transition-colors"
            style={view === "published" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
          >
            <span className="capitalize">Published</span>
            <span style={{ opacity: 0.8 }}>{published.length}</span>
          </button>
          <div className="w-px self-stretch my-1" style={{ background: "var(--border)" }} />
          <button
            onClick={() => setView("drafts")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md cursor-pointer transition-colors"
            style={view === "drafts" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
          >
            <FiEdit2 size={12} /> Drafts
            <span style={{ opacity: 0.8 }}>{drafts.length}</span>
          </button>
        </div>

        <div className="flex flex-col gap-px">
          {posts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: "var(--muted)" }}>No posts yet.</p>
              <Link href="/admin/posts/new" className="btn-ghost no-underline inline-flex mt-2 text-xs">Create your first post</Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: "var(--muted)" }}>No {view} posts.</p>
          ) : (
            visible.map((post) => (
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
                  <button onClick={() => setStatsFor(post)} className="inline-flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer" style={{ borderColor: "var(--border)" }} title="Stats">
                    <FiBarChart2 size={15} />
                  </button>
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
      {statsFor && <StatsSheet post={statsFor} stats={postStats(statsFor)} href={postHref(statsFor)} onClose={() => setStatsFor(null)} />}
    </div>
  );
}
