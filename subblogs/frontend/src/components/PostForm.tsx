"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";
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
  recipientWallet: string;
  status: "draft" | "published";
  featured: boolean;
  type: string;
  audioUrl: string;
  audioStorageRef: string;
  audioEncryptedKey: string;
  audioContentType: string;
  media: string;
}

const defaults: PostFormData = {
  title: "", slug: "", bodyMarkdown: "", excerpt: "",
  tags: "", coverUrl: "", videoUrl: "",
  price: "", recipientWallet: "", status: "draft", featured: false, type: "article",
  audioUrl: "", audioStorageRef: "", audioEncryptedKey: "", audioContentType: "", media: "",
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
  const [coverKey, setCoverKey] = useState("");
  const slugEdited = useRef(!!initialData?.slug);
  const loaded = useRef(false);

  // Load site defaults for price and wallet
  useEffect(() => {
    if (postId) return; // editing — keep existing values
    if (initialData?.price && initialData?.recipientWallet) return; // already have values
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch("/api/settings", { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json()).then(d => {
      const s = d.settings || {};
      setForm((prev) => ({
        ...prev,
        price: prev.price || s.defaultPrice || "",
        recipientWallet: prev.recipientWallet || s.recipientWallet || "",
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialData && !loaded.current) {
      loaded.current = true;
      if (initialData.slug) slugEdited.current = true;
      setForm((prev) => ({ ...prev, ...initialData }));
      if (initialData.coverUrl && initialData.media) {
        try {
          const items = JSON.parse(initialData.media);
          const match = items.find((m: { url?: string }) => m && m.url === initialData.coverUrl);
          if (match) setCoverKey(match.url);
        } catch {}
      }
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
      if (isPaid && !form.coverUrl && !coverKey) return { ok: false, reason: "Select a cover photo with the star" };
    }
    if (form.type === "video") {
      if (!form.videoUrl) return { ok: false, reason: "YouTube URL is required" };
    }
    if (form.type === "music") {
      if (!form.audioUrl && !form.audioStorageRef) return { ok: false, reason: "Audio file is required" };
    }
    return { ok: true };
  }

  const isPaid = !!form.price && form.price !== "0";

  function handleCoverChange(coverUrl: string, key: string) {
    setForm((prev) => ({ ...prev, coverUrl }));
    setCoverKey(key);
  }

  function buildPhotoPayload() {
    let items: Array<Record<string, unknown>> = [];
    try { items = JSON.parse(form.media || "[]"); } catch { items = []; }
    if (!isPaid && coverKey && form.coverUrl) {
      items = items.filter((m) => {
        const k = (m as { storageRef?: string; url?: string }).storageRef || (m as { url?: string }).url || "";
        return k !== coverKey;
      });
    }
    return JSON.stringify(items.map(({ _fileKey, ...m }) => m));
  }

  function photoBody() {
    return { ...form, media: buildPhotoPayload(), coverKey };
  }

  function handleAudioUpload(result: { url?: string; storageRef?: string; encryptedKey?: string; contentType?: string }) {
    if (result.storageRef) {
      setForm((prev) => ({ ...prev, audioUrl: "", audioStorageRef: result.storageRef!, audioEncryptedKey: result.encryptedKey || "", audioContentType: result.contentType || "" }));
    } else {
      setForm((prev) => ({ ...prev, audioUrl: result.url || "", audioStorageRef: "", audioEncryptedKey: "", audioContentType: "" }));
    }
  }

  function createPost(status: "draft" | "published") {
    setError("");
    setSaving(true);
    const payload = form.type === "photo"
      ? { ...photoBody(), status }
      : { ...form, status };
    apiAuthFetch("/blog/admin/posts", {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then(() => router.push("/admin/posts"))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to save"))
      .finally(() => setSaving(false));
  }

  function updatePost() {
    if (!postId) return;
    setError("");
    setSaving(true);
    const payload = form.type === "photo" ? photoBody() : form;
    apiAuthFetch(`/blog/admin/posts/${postId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
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

      {form.type === "article" && <MarkdownEditor value={form.bodyMarkdown} onChange={(v) => update("bodyMarkdown", v)} />}
      {form.type === "article" && (
        <Field label="Excerpt">
          <textarea
            value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)}
            rows={2} className="input-field" placeholder="Short description"
          />
        </Field>
      )}
      {form.type === "article" && (
        <Field label="Cover Image">
          <ImageUploader
            maxFiles={1}
            value={form.coverUrl ? [{ url: form.coverUrl, caption: "" }] : []}
            onChange={(items) => update("coverUrl", items[0]?.url || "")}
          />
        </Field>
      )}

      {form.type === "photo" && (
        <>
          <Field label="Photos">
            <ImageUploader
              encrypted={isPaid}
              allowCover
              coverKey={coverKey}
              onCoverChange={handleCoverChange}
              value={form.media ? JSON.parse(form.media) : []}
              onChange={(items) => setForm(p => ({ ...p, media: JSON.stringify(items) }))}
            />
            {isPaid && !form.coverUrl && !coverKey && (
              <div style={{ fontSize: "12px", color: "#d97706" }}>
                Select a cover photo with the star — it will be public and the rest stay encrypted.
              </div>
            )}
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
              encrypted={isPaid}
              onUpload={handleAudioUpload}
              existingUrl={form.audioUrl || (form.audioStorageRef ? "Encrypted file" : "")}
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
      <Field label="Recipient Wallet">
        <input
          type="text" value={form.recipientWallet} onChange={(e) => update("recipientWallet", e.target.value)}
          className="input-field font-mono" placeholder="0x... (defaults to site wallet)"
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
        </>)}

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
