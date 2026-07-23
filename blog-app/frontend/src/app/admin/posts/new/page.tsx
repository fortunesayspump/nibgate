"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";

export default function NewPostPage() {
  const router = useRouter();
  const [form, setForm] = useState<{
    title: string; slug: string; bodyMarkdown: string; excerpt: string;
    tag: string; tags: string; coverUrl: string; price: string; status: "draft" | "published"; featured: boolean;
    type: string;
  }>({
    title: "", slug: "", bodyMarkdown: "", excerpt: "",
    tag: "General", tags: "", coverUrl: "", price: "", status: "draft", featured: false, type: "article",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) router.push("/admin/login");
  }, [router]);

  function generateSlug(title: string) {
    return title.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
  }

  function handleTitleChange(value: string) {
    setForm((prev) => ({ ...prev, title: value, slug: prev.slug || generateSlug(value) }));
  }

  function save(status: "draft" | "published") {
    setError("");
    setSaving(true);
    apiAuthFetch("/blog/admin/posts", {
      method: "POST", body: JSON.stringify({ ...form, status }),
    })
      .then(() => router.push("/admin/posts"))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to save"))
      .finally(() => setSaving(false));
  }

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <button onClick={() => router.push("/admin/posts")} className="btn-ghost inline-flex items-center gap-1">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold mb-6">New Post</h1>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

        <div className="space-y-4">
          <Field label="Title">
            <input type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} required
              className="input-field" placeholder="Post title" />
          </Field>
          <Field label="Slug">
            <input type="text" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              className="input-field font-mono" placeholder="post-slug" />
          </Field>
          <MarkdownEditor value={form.bodyMarkdown} onChange={(v) => setForm((p) => ({ ...p, bodyMarkdown: v }))} />
          <Field label="Excerpt">
            <textarea value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} rows={2}
              className="input-field" placeholder="Short description" />
          </Field>
          <Field label="Tag">
            <input type="text" value={form.tag} onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))}
              className="input-field" placeholder="General" />
          </Field>
          <Field label="Tags (comma separated)">
            <input type="text" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
              className="input-field" placeholder="tools,craft" />
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
            <input type="text" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className="input-field" placeholder="0.01 (leave empty for free)" />
          </Field>
          <Field label="Cover Image URL">
            <input type="text" value={form.coverUrl} onChange={(e) => setForm((p) => ({ ...p, coverUrl: e.target.value }))}
              className="input-field" placeholder="https://..." />
          </Field>

          <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => save("published")} disabled={saving || !form.title || !form.bodyMarkdown}
              className="btn-primary">
              {saving ? "Publishing..." : "Publish"}
            </button>
            <button onClick={() => save("draft")} disabled={saving || !form.title}
              className="btn-secondary">
              Save as Draft
            </button>
          </div>
        </div>
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
