"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit3, Loader2, Plus, Trash2, Upload, ExternalLink } from "lucide-react";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  tags: string[];
  coverUrl: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
  bodyMarkdown: string;
};

type AuthorState = {
  checked: boolean;
  canPublish: boolean;
  walletAddress: string;
};

const emptyForm = {
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  tag: "Company",
  tags: "",
  coverUrl: "",
  status: "published",
  bodyMarkdown: "",
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text();
  throw new Error(`Expected JSON but got ${text.replace(/\s+/g, " ").slice(0, 160)}`);
}

function formatDate(value?: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function DashboardBlogPage() {
  const [author, setAuthor] = useState<AuthorState>({ checked: false, canPublish: false, walletAddress: "" });
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(form.id);
  const previewUrl = form.slug ? `/blog/${form.slug}` : "";

  const sortedPosts = useMemo(() => posts, [posts]);

  const setField = (name: string, value: string) => {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "title" && !current.id) next.slug = slugify(value);
      if (name === "slug") next.slug = slugify(value);
      return next;
    });
  };

  const loadPosts = async () => {
    setError("");
    try {
      const res = await fetch("/api/blog/admin/posts", { credentials: "include" });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      setPosts(data.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        const res = await fetch("/api/blog/admin/me", { credentials: "include" });
        const data = await readApiJson(res);
        if (cancelled) return;
        const nextAuthor = { checked: true, canPublish: Boolean(data.canPublish), walletAddress: data.walletAddress || "" };
        setAuthor(nextAuthor);
        if (nextAuthor.canPublish) await loadPosts();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to check blog access");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const editPost = (post: BlogPost) => {
    setMessage("");
    setError("");
    setForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || "",
      tag: post.tag || "Company",
      tags: (post.tags || []).join(", "),
      coverUrl: post.coverUrl || "",
      status: post.status,
      bodyMarkdown: post.bodyMarkdown || "",
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setMessage("");
    setError("");
    setPublishedSlug("");
  };

  const savePost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(isEditing ? `/api/blog/admin/posts/${form.id}` : "/api/blog/admin/posts", {
        method: isEditing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to save post");
      setMessage(form.status === "published" ? "Post published." : "Draft saved.");
      if (form.status === "published" && data.post?.slug) setPublishedSlug(data.post.slug);
      else if (form.status === "published" && form.slug) setPublishedSlug(form.slug);
      resetForm();
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"?`)) return;
    setDeletingId(post.id);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/blog/admin/posts/${post.id}`, { method: "DELETE", credentials: "include" });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to delete post");
      setMessage("Post deleted.");
      if (form.id === post.id) resetForm();
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
    } finally {
      setDeletingId("");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (author.checked && !author.canPublish) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center p-6 md:p-10">
        <div className="rounded-[2rem] border p-8 md:p-10" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
          <p className="text-sm font-medium uppercase tracking-[0.08em] opacity-60">Blog access</p>
          <h1 className="mt-4 text-4xl font-medium md:text-6xl">Blog publishing is private.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 opacity-75">
            This area is only available to the Nibgate blog owner.
          </p>
          <Link href="/blog" className="nibgate-soft-cta mt-8 inline-flex">View public blog</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 rounded-[2rem] border p-6 md:flex-row md:items-end md:p-8" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.08em] opacity-60">Blog editor</p>
          <h1 className="mt-3 text-4xl font-medium md:text-6xl">Publish Nibgate updates</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 opacity-70">Write posts, save drafts, and publish updates to the public Nibgate blog.</p>
        </div>
        <button type="button" onClick={resetForm} className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-white">
          <Plus className="h-4 w-4" /> New post
        </button>
      </div>

      {(error || message) && (
        <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: error ? "rgba(160,40,40,0.25)" : "var(--nib-border-soft)", background: error ? "rgba(255,230,230,0.75)" : "var(--nib-surface)" }}>
          {error || message}
        </div>
      )}
      {publishedSlug && (
        <div className="rounded-2xl border p-4 text-sm flex items-center gap-2" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
          <ExternalLink className="h-4 w-4" />
          <a href={`/blog/${publishedSlug}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--nib-teal)", textDecoration: "underline" }}>
            nibgate.xyz/blog/{publishedSlug}
          </a>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border p-5 md:p-6" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-medium">Posts</h2>
            <span className="text-sm opacity-60">{sortedPosts.length} total</span>
          </div>
          <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-1">
            {sortedPosts.length === 0 ? (
              <div className="rounded-3xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No blog posts yet.</div>
            ) : sortedPosts.map((post) => (
              <article key={post.id} className="rounded-3xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: form.id === post.id ? "var(--nib-page-bg)" : "transparent" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.08em] opacity-60">
                      <span>{post.status}</span>
                      <span>/</span>
                      <span>{formatDate(post.publishedAt)}</span>
                    </div>
                    <h3 className="mt-2 text-xl font-medium leading-tight">{post.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 opacity-70">{post.excerpt}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => editPost(post)} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm" style={{ borderColor: "var(--nib-border-soft)" }}>
                    <Edit3 className="h-4 w-4" /> Edit
                  </button>
                  {post.status === "published" && <Link href={`/blog/${post.slug}`} className="rounded-full border px-3 py-2 text-sm no-underline text-black" style={{ borderColor: "var(--nib-border-soft)" }}>Open</Link>}
                  <button type="button" onClick={() => deletePost(post)} disabled={deletingId === post.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--nib-border-soft)" }}>
                    {deletingId === post.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <form onSubmit={savePost} className="rounded-[2rem] border p-5 md:p-6" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-2xl font-medium">{isEditing ? "Edit post" : "New post"}</h2>
            {previewUrl && <span className="font-mono text-xs opacity-60">{previewUrl}</span>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium opacity-70">Title</span>
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} required className="w-full rounded-2xl border bg-transparent px-4 py-3 text-lg outline-none" style={{ borderColor: "var(--nib-border-soft)" }} placeholder="What we are building with verified discovery" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium opacity-70">Slug</span>
              <input value={form.slug} onChange={(event) => setField("slug", event.target.value)} required className="w-full rounded-2xl border bg-transparent px-4 py-3 outline-none" style={{ borderColor: "var(--nib-border-soft)" }} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium opacity-70">Status</span>
              <select value={form.status} onChange={(event) => setField("status", event.target.value)} className="w-full rounded-2xl border bg-transparent px-4 py-3 outline-none" style={{ borderColor: "var(--nib-border-soft)" }}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium opacity-70">Tag</span>
              <input value={form.tag} onChange={(event) => setField("tag", event.target.value)} className="w-full rounded-2xl border bg-transparent px-4 py-3 outline-none" style={{ borderColor: "var(--nib-border-soft)" }} placeholder="Product" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium opacity-70">Tags</span>
              <input value={form.tags} onChange={(event) => setField("tags", event.target.value)} className="w-full rounded-2xl border bg-transparent px-4 py-3 outline-none" style={{ borderColor: "var(--nib-border-soft)" }} placeholder="agents, discovery, x402" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium opacity-70">Cover image</span>
              <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
                <button type="button" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover} className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
                  {uploadingCover ? "Uploading..." : "Upload cover"}
                </button>
                {form.coverUrl && (
                  <div style={{ position: "relative", width: 160, borderRadius: 8, overflow: "hidden" }}>
                    <img src={form.coverUrl} alt="Cover preview" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                    <button type="button" onClick={() => setField("coverUrl", "")} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 14, lineHeight: "22px", textAlign: "center" }}>×</button>
                  </div>
                )}
              </div>
              <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingCover(true);
                try {
                  const reader = new FileReader();
                  reader.readAsDataURL(file);
                  reader.onload = async () => {
                    const res = await fetch("/api/uploads/profile-image", {
                      method: "POST", credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ target: "cover", image: reader.result }),
                    });
                    const data = await res.json();
                    if (data.url) setField("coverUrl", data.url);
                    else throw new Error(data.error || "Upload failed");
                  };
                } catch (err: any) { setError(err.message); }
                setUploadingCover(false);
                e.target.value = "";
              }} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium opacity-70">Excerpt</span>
              <textarea value={form.excerpt} onChange={(event) => setField("excerpt", event.target.value)} rows={3} className="w-full resize-none rounded-2xl border bg-transparent px-4 py-3 outline-none" style={{ borderColor: "var(--nib-border-soft)" }} placeholder="Short summary shown on the blog index." />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium opacity-70">Body markdown</span>
              <textarea value={form.bodyMarkdown} onChange={(event) => setField("bodyMarkdown", event.target.value)} required rows={15} className="w-full resize-y rounded-2xl border bg-transparent px-4 py-3 font-mono text-sm leading-7 outline-none" style={{ borderColor: "var(--nib-border-soft)" }} placeholder={"## Section title\n\nWrite the post in simple markdown.\n\n- Bullets work\n- Headings work"} />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-3 text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {form.status === "published" ? "Publish" : "Save draft"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-full border px-5 py-3" style={{ borderColor: "var(--nib-border-soft)" }}>Reset</button>
          </div>
        </form>
      </div>
    </div>
  );
}
