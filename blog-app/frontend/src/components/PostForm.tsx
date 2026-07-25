"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch, apiUrl } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";
import ImageUploader from "@/components/ImageUploader";
import AudioUploader from "@/components/AudioUploader";

interface PostFormData {
  title: string;
  slug: string;
  bodyMarkdown: string;
  excerpt: string;
  tags: string;
  coverUrl: string;
  videoUrl: string;
  price: string;
  status: "draft" | "published";
  featured: boolean;
  type: string;
  audioUrl: string;
  media: string;
}

const defaults: PostFormData = {
  title: "", slug: "", bodyMarkdown: "", excerpt: "",
  tags: "", coverUrl: "", videoUrl: "",
  price: "", status: "draft", featured: false, type: "article",
  audioUrl: "", media: "",
};

interface PostFormProps {
  initialData?: Partial<PostFormData>;
  postId?: string;
}

export default function PostForm({ initialData, postId }: PostFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<PostFormData>({ ...defaults, ...initialData });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const slugEdited = useRef(!!initialData?.slug);
  const loaded = useRef(false);

  useEffect(() => {
    if (initialData && !loaded.current) {
      loaded.current = true;
      if (initialData.slug) slugEdited.current = true;
      setForm((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  function generateSlug(title: string): string {
    return title.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
  }

  function handleTitleChange(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugEdited.current ? prev.slug : generateSlug(value),
    }));
  }

  function update<K extends keyof PostFormData>(key: K, value: PostFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getYoutubeId(url: string): string | null {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function canPublish(): { ok: boolean; reason?: string } {
    if (!form.title) return { ok: false, reason: "Title is required" };
    if (!form.slug) return { ok: false, reason: "Slug is required" };
    if (form.type === "article") {
      if (!form.bodyMarkdown) return { ok: false, reason: "Body content is required" };
    }
    if (form.type === "photo") {
      if (!form.media || form.media === "[]") return { ok: false, reason: "At least one photo is required" };
    }
    if (form.type === "video") {
      if (!form.videoUrl) return { ok: false, reason: "YouTube URL is required" };
    }
    if (form.type === "music") {
      if (!form.audioUrl) return { ok: false, reason: "Audio file is required" };
    }
    return { ok: true };
  }

  function createPost(status: "draft" | "published") {
    setError("");
    setSaving(true);
    apiAuthFetch("/blog/admin/posts", {
      method: "POST",
      body: JSON.stringify({ ...form, status }),
    })
      .then(() => router.push("/admin/posts"))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to save"))
      .finally(() => setSaving(false));
  }

  function updatePost() {
    if (!postId) return;
    setError("");
    setSaving(true);
    apiAuthFetch(`/blog/admin/posts/${postId}`, {
      method: "PUT",
      body: JSON.stringify(form),
    })
      .then(() => router.push("/admin/posts"))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to update"))
      .finally(() => setSaving(false));
  }

  function updatePostStatus(status: "draft" | "published") {
    if (!postId) return;
    setSaving(true);
    apiAuthFetch(`/blog/admin/posts/${postId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    })
      .then(() => router.push("/admin/posts"))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"))
      .finally(() => setSaving(false));
  }

  const vid = getYoutubeId(form.videoUrl);

  return (
    <div className="space-y-6">
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

      <Field label="Title">
        <input
          type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} required
          className="input-field"
          placeholder={form.type === "photo" ? "Photo title" : form.type === "video" ? "Video title" : form.type === "music" ? "Track title" : "Post title"}
        />
      </Field>

      <Field label="Slug">
        <input
          type="text" value={form.slug} maxLength={90}
          onChange={(e) => { slugEdited.current = true; update("slug", generateSlug(e.target.value)); }}
          className="input-field font-mono" placeholder="auto-generated-from-title"
        />
      </Field>

      <Field label="Type">
        <select value={form.type} onChange={(e) => update("type", e.target.value)} className="input-field">
          <option value="article">Article</option>
          <option value="photo">Photo</option>
          <option value="video">Video</option>
          <option value="music">Music</option>
        </select>
      </Field>

      {form.type === "article" && (
        <>
          <MarkdownEditor value={form.bodyMarkdown} onChange={(v) => update("bodyMarkdown", v)} />
          <Field label="Excerpt">
            <textarea
              value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)}
              rows={2} className="input-field" placeholder="Short description"
            />
          </Field>
          <Field label="Cover Image">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => document.getElementById("cover-upload")?.click()} className="btn-ghost text-xs" style={{ padding: "6px 12px" }}>
                Upload cover
              </button>
              <input
                type="text" value={form.coverUrl} onChange={(e) => update("coverUrl", e.target.value)}
                className="input-field" placeholder="https://..." style={{ flex: 1, minWidth: 200 }}
              />
            </div>
            {form.coverUrl && (
              <div style={{ marginTop: 8, position: "relative", width: 200, borderRadius: 6, overflow: "hidden" }}>
                <img src={form.coverUrl} alt="Cover preview" style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                <button type="button" onClick={() => update("coverUrl", "")} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 14, lineHeight: "22px", textAlign: "center" }}>×</button>
              </div>
            )}
            <input id="cover-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const token = localStorage.getItem("token");
              const fd = new FormData();
              fd.append("file", file);
              try {
                const res = await fetch(apiUrl("/upload"), { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
                const data = await res.json();
                if (data.url) update("coverUrl", data.url);
              } catch {}
              e.target.value = "";
            }} />
          </Field>
        </>
      )}

      {form.type === "photo" && (
        <>
          <Field label="Photos">
            <ImageUploader
              value={form.media ? JSON.parse(form.media) : []}
              onChange={(items) => setForm(p => ({ ...p, media: JSON.stringify(items) }))}
            />
          </Field>
          <Field label="Caption">
            <textarea
              value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)}
              rows={3} className="input-field" placeholder="Write a caption for this photo..."
            />
          </Field>
        </>
      )}

      {form.type === "video" && (
        <>
          <Field label="YouTube Video URL">
            <input
              type="text" value={form.videoUrl} onChange={(e) => update("videoUrl", e.target.value)}
              className="input-field" placeholder="https://www.youtube.com/watch?v=..."
            />
          </Field>
          {vid && (
            <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "16/9", background: "var(--surface)" }}>
              <img
                src={`https://img.youtube.com/vi/${vid}/maxresdefault.jpg`} alt="Video preview"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`; }}
              />
            </div>
          )}
          <Field label="Description">
            <textarea
              value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)}
              rows={3} className="input-field" placeholder="Describe this video..."
            />
          </Field>
        </>
      )}

      {form.type === "music" && (
        <>
          <Field label="Cover Art">
            <ImageUploader
              maxFiles={1}
              value={form.coverUrl ? [{ url: form.coverUrl, caption: "" }] : []}
              onChange={(items) => update("coverUrl", items[0]?.url || "")}
            />
          </Field>
          <Field label="Audio File">
            <AudioUploader
              onUpload={(url) => update("audioUrl", url)}
              existingUrl={form.audioUrl}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)}
              rows={3} className="input-field" placeholder="Describe this track..."
            />
          </Field>
        </>
      )}

      <Field label="Tags (comma separated)">
        <input
          type="text" value={form.tags} onChange={(e) => update("tags", e.target.value)}
          className="input-field" placeholder="tools, craft, general"
        />
      </Field>
      <Field label="Price (USDC)">
        <input
          type="text" value={form.price} onChange={(e) => update("price", e.target.value)}
          className="input-field" placeholder="0.01 (leave empty for free)"
        />
      </Field>

      <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        {postId ? (
          <>
            <button type="button" onClick={updatePost} disabled={saving || !form.title} className="btn-primary">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => updatePostStatus(form.status === "published" ? "draft" : "published")}
              disabled={saving}
              className="btn-secondary"
            >
              {form.status === "published" ? "Unpublish" : "Publish"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => createPost("published")} disabled={saving || !canPublish().ok} className="btn-primary" title={canPublish().ok ? "" : canPublish().reason}>
              {saving ? "Publishing..." : "Publish"}
            </button>
            <button type="button" onClick={() => createPost("draft")} disabled={saving || !form.title} className="btn-secondary">
              Save as Draft
            </button>
          </>
        )}
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
