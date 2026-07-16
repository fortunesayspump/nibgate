"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiAuthFetch, type BlogPost } from "@/lib/api";

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const [form, setForm] = useState<{
    title: string; slug: string; bodyMarkdown: string; excerpt: string;
    tag: string; tags: string; coverUrl: string; status: "draft" | "published"; featured: boolean;
  }>({
    title: "", slug: "", bodyMarkdown: "", excerpt: "",
    tag: "General", tags: "", coverUrl: "", status: "draft", featured: false,
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
          coverUrl: p.coverUrl || "", status: p.status as "draft" | "published", featured: p.featured,
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

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">Loading...</div>;

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-lg">
        <button onClick={() => router.push("/admin/posts")} className="mb-6 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors cursor-pointer font-medium">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold mb-6">Edit Post</h1>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title">
            <input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" />
          </Field>
          <Field label="Body (Markdown)">
            <textarea value={form.bodyMarkdown} onChange={(e) => setForm((p) => ({ ...p, bodyMarkdown: e.target.value }))} rows={14} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md font-mono leading-relaxed resize-y" />
          </Field>
          <Field label="Excerpt">
            <textarea value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} rows={2} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md resize-y" />
          </Field>
          <Field label="Tag">
            <input type="text" value={form.tag} onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" />
          </Field>
          <Field label="Cover Image URL">
            <input type="text" value={form.coverUrl} onChange={(e) => setForm((p) => ({ ...p, coverUrl: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" />
          </Field>

          <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
            <button type="submit" disabled={saving}
              className="bg-[var(--accent-soft)] border border-[var(--accent)] text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-40 cursor-pointer">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {form.status === "published" ? (
              <button type="button" onClick={() => updateStatus("draft")}
                className="border border-[var(--border)] px-4 py-2.5 rounded-md text-xs font-medium hover:bg-[var(--surface)] transition-all cursor-pointer">
                Unpublish
              </button>
            ) : (
              <button type="button" onClick={() => updateStatus("published")}
                className="border border-[var(--border)] px-4 py-2.5 rounded-md text-xs font-medium hover:bg-[var(--surface)] transition-all cursor-pointer">
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
      <label className="text-xs font-medium text-[var(--muted)]">{label}</label>
      {children}
    </div>
  );
}
