"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiAuthFetch, type BlogPost } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const [form, setForm] = useState<{
    title: string; slug: string; bodyMarkdown: string; excerpt: string;
    tag: string; tags: string; coverUrl: string; price: string; status: "draft" | "published"; featured: boolean;
    type: string;
  }>({
    title: "", slug: "", bodyMarkdown: "", excerpt: "",
    tag: "General", tags: "", coverUrl: "", price: "", status: "draft", featured: false, type: "article",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/admin/login"); return; }
    apiAuthFetch<{ success: boolean; post: BlogPost }>(`/blog/admin/posts/${params.id}`)
      .then((data) => {
        const p = data.post;
        setForm({
          title: p.title, slug: p.slug, bodyMarkdown: p.bodyMarkdown,
          excerpt: p.excerpt || "", tag: p.tag || "General",
          tags: Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || "",
          coverUrl: p.coverUrl || "", price: p.price || "", status: p.status as "draft" | "published", featured: p.featured, type: p.type || "article",
        });
      })
      .catch(() => router.push("/admin/posts"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiAuthFetch(`/blog/admin/posts/${params.id}`, { method: "PUT", body: JSON.stringify(form) });
      router.push("/admin/posts");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally { setSaving(false); }
  }

  async function updateStatus(status: "draft" | "published") {
    setSaving(true);
    try {
      await apiAuthFetch(`/blog/admin/posts/${params.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      router.push("/admin/posts");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <button onClick={() => router.push("/admin/posts")} className="btn-ghost inline-flex items-center gap-1">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold mb-6">Edit Post</h1>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title">
            <input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="input-field" />
          </Field>
          <MarkdownEditor value={form.bodyMarkdown} onChange={(v) => setForm((p) => ({ ...p, bodyMarkdown: v }))} />
          <Field label="Excerpt">
            <textarea value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} rows={2} className="input-field" />
          </Field>
          <Field label="Tag">
            <input type="text" value={form.tag} onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))} className="input-field" />
          </Field>
          <Field label="Tags (comma separated)">
            <input type="text" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} className="input-field" placeholder="tools,craft" />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="input-field">
              <option value="article">Article</option>
              <option value="photo">Photo</option>
              <option value="music">Music</option>
              <option value="video">Video</option>
            </select>
          </Field>
          <Field label="Price (USDC)">
            <input type="text" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} className="input-field" placeholder="0.01 (leave empty for free)" />
          </Field>
          <Field label="Cover Image URL">
            <input type="text" value={form.coverUrl} onChange={(e) => setForm((p) => ({ ...p, coverUrl: e.target.value }))} className="input-field" />
          </Field>

          <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {form.status === "published" ? (
              <button type="button" onClick={() => updateStatus("draft")} className="btn-secondary">
                Unpublish
              </button>
            ) : (
              <button type="button" onClick={() => updateStatus("published")} className="btn-secondary">
                Publish
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}
