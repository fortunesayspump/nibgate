"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";

export default function NewPostPage() {
  const router = useRouter();
  const [form, setForm] = useState<{
    title: string; slug: string; bodyMarkdown: string; excerpt: string;
    tag: string; tags: string; coverUrl: string; price: string; status: "draft" | "published"; featured: boolean;
  }>({
    title: "", slug: "", bodyMarkdown: "", excerpt: "",
    tag: "General", tags: "", coverUrl: "", price: "", status: "draft", featured: false,
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
      <div className="mx-auto max-w-lg">
        <button onClick={() => router.push("/admin/posts")} className="mb-6 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors cursor-pointer font-medium">
          &larr; Back
        </button>
        <h1 className="text-lg font-semibold mb-6">New Post</h1>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

        <div className="space-y-4">
          <Field label="Title">
            <input type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} required
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" placeholder="Post title" />
          </Field>
          <Field label="Slug">
            <input type="text" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md font-mono" placeholder="post-slug" />
          </Field>
          <Field label="Body (Markdown)">
            <textarea value={form.bodyMarkdown} onChange={(e) => setForm((p) => ({ ...p, bodyMarkdown: e.target.value }))} rows={14}
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md font-mono leading-relaxed resize-y" placeholder="Write in markdown..." />
          </Field>
          <Field label="Excerpt">
            <textarea value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} rows={2}
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md resize-y" placeholder="Short description" />
          </Field>
          <Field label="Tag">
            <input type="text" value={form.tag} onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))}
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" placeholder="General" />
          </Field>
          <Field label="Price (USDC)">
            <input type="text" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" placeholder="0.01 (leave empty for free)" />
          </Field>
          <Field label="Cover Image URL">
            <input type="text" value={form.coverUrl} onChange={(e) => setForm((p) => ({ ...p, coverUrl: e.target.value }))}
              className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" placeholder="https://..." />
          </Field>

          <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
            <button onClick={() => save("published")} disabled={saving || !form.title || !form.bodyMarkdown}
              className="bg-[var(--accent-soft)] border border-[var(--accent)] text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-40 cursor-pointer">
              {saving ? "Publishing..." : "Publish"}
            </button>
            <button onClick={() => save("draft")} disabled={saving || !form.title}
              className="border border-[var(--border)] px-4 py-2.5 rounded-md text-xs font-medium hover:bg-[var(--surface)] transition-all cursor-pointer">
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
      <label className="text-xs font-medium text-[var(--muted)]">{label}</label>
      {children}
    </div>
  );
}
