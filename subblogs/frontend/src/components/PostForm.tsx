"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiUsers, FiEye } from "react-icons/fi";
import { apiAuthFetch } from "@/lib/api";
import MarkdownEditor, { type EmbeddedMediaItem } from "@/components/MarkdownEditor";
import ImageUploader from "@/components/ImageUploader";
import AudioUploader from "@/components/AudioUploader";
import DocumentUploader from "@/components/DocumentUploader";
import VideoUploader from "@/components/VideoUploader";
import { WalletListEditor } from "@/components/WalletListEditor";
import { formatUsd, ADDR_RE } from "@/lib/wallet";

interface PostFormData {
  title: string;
  slug: string;
  bodyMarkdown: string;
  excerpt: string;
  tags: string;
  coverUrl: string;
  videoUrl: string;
  videoStorageRef: string;
  videoEncryptedKey: string;
  videoContentType: string;
  videoName: string;
  videoSize: number | null;
  price: string;
  recipientWallet: string;
  status: "draft" | "published";
  featured: boolean;
  type: string;
  audioUrl: string;
  audioStorageRef: string;
  audioEncryptedKey: string;
  audioContentType: string;
  documentUrl: string;
  documentName: string;
  documentSize: number | null;
  documentStorageRef: string;
  documentEncryptedKey: string;
  documentContentType: string;
  media: string;
  whitelist: string[];
  whitelistPrice: string;
  inviteOnly: boolean;
}

const defaults: PostFormData = {
  title: "", slug: "", bodyMarkdown: "", excerpt: "",
  tags: "", coverUrl: "", videoUrl: "",
  videoStorageRef: "", videoEncryptedKey: "", videoContentType: "", videoName: "", videoSize: null,
  price: "", recipientWallet: "", status: "draft", featured: false, type: "article",
  audioUrl: "", audioStorageRef: "", audioEncryptedKey: "", audioContentType: "",
  documentUrl: "", documentName: "", documentSize: null, documentStorageRef: "", documentEncryptedKey: "", documentContentType: "",
  media: "",
  whitelist: [], whitelistPrice: "", inviteOnly: false,
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
  const [embeddedMedia, setEmbeddedMedia] = useState<EmbeddedMediaItem[]>([]);
  const [previewAs, setPreviewAs] = useState<"public" | "whitelisted">("public");
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
          const match = items.find((m: { storageRef?: string; url?: string }) => m && (m.storageRef === initialData.coverUrl || m.url === initialData.coverUrl));
          if (match) setCoverKey(match.storageRef || match.url);
        } catch {}
      }
      if (initialData.type === "article" && initialData.media) {
        try {
          const items = JSON.parse(initialData.media);
          if (Array.isArray(items)) setEmbeddedMedia(items.filter((m) => m && m.storageRef));
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
      if (!form.coverUrl && !coverKey) return { ok: false, reason: "Select a cover photo with the star" };
    }
    if (form.type === "video") {
      if (!form.videoUrl && !form.videoStorageRef) return { ok: false, reason: "Add a YouTube URL or upload a video file" };
    }
    if (form.type === "music") {
      if (!form.audioUrl && !form.audioStorageRef) return { ok: false, reason: "Audio file is required" };
    }
    if (form.type === "document") {
      if (!form.documentUrl && !form.documentStorageRef) return { ok: false, reason: "Document file is required" };
    }
    for (const w of form.whitelist) {
      if (!ADDR_RE.test(w)) return { ok: false, reason: `Invalid address: ${w}` };
    }
    if (form.whitelistPrice.trim() !== "" && form.whitelistPrice !== "0") {
      const n = Number(form.whitelistPrice);
      if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "Whitelist price must be a non-negative number" };
    }
    if (form.inviteOnly && form.whitelist.length === 0) {
      return { ok: false, reason: "Invite-only needs at least one whitelisted wallet" };
    }
    return { ok: true };
  }

  function handleCoverChange(coverUrl: string, key: string) {
    setForm((prev) => ({ ...prev, coverUrl }));
    setCoverKey(key);
  }

  function buildPhotoPayload() {
    let items: Array<Record<string, unknown>> = [];
    try { items = JSON.parse(form.media || "[]"); } catch { items = []; }
    if (coverKey && form.coverUrl) {
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

  function handleDocumentUpload(result: { url?: string; storageRef?: string; encryptedKey?: string; contentType?: string; name?: string; size?: number }) {
    if (result.storageRef) {
      setForm((prev) => ({
        ...prev,
        documentUrl: "",
        documentStorageRef: result.storageRef!,
        documentEncryptedKey: result.encryptedKey || "",
        documentContentType: result.contentType || "",
        documentName: result.name || prev.documentName,
        documentSize: result.size ?? prev.documentSize,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        documentUrl: result.url || "",
        documentStorageRef: "",
        documentEncryptedKey: "",
        documentContentType: result.contentType || "",
        documentName: result.name || prev.documentName,
        documentSize: result.size ?? prev.documentSize,
      }));
    }
  }

  function handleVideoUpload(result: { url?: string; storageRef?: string; encryptedKey?: string; contentType?: string; name?: string; size?: number }) {
    if (result.storageRef) {
      setForm((prev) => ({ ...prev, videoUrl: "", videoStorageRef: result.storageRef!, videoEncryptedKey: result.encryptedKey || "", videoContentType: result.contentType || "", videoName: result.name || prev.videoName, videoSize: result.size ?? prev.videoSize }));
    } else {
      setForm((prev) => ({ ...prev, videoUrl: result.url || "", videoStorageRef: "", videoEncryptedKey: "", videoContentType: "", videoName: result.name || prev.videoName, videoSize: result.size ?? prev.videoSize }));
    }
  }

  function createPost(status: "draft" | "published") {
    setError("");
    setSaving(true);
    const videoCover = form.type === "video" && vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : "";
    const resolved = { ...form, coverUrl: form.coverUrl || videoCover };
    const accessFields = {
      whitelist: form.whitelist,
      whitelistPrice: form.whitelistPrice.trim() === "" ? null : form.whitelistPrice,
      publicAccess: !form.inviteOnly,
    };
    const payload = resolved.type === "photo"
      ? { ...photoBody(), coverUrl: resolved.coverUrl, status, ...accessFields }
      : resolved.type === "article"
        ? { ...resolved, media: JSON.stringify(embeddedMedia), status, ...accessFields }
        : { ...resolved, status, ...accessFields };
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
    const videoCover = form.type === "video" && vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : "";
    const resolved = { ...form, coverUrl: form.coverUrl || videoCover };
    const accessFields = {
      whitelist: form.whitelist,
      whitelistPrice: form.whitelistPrice.trim() === "" ? null : form.whitelistPrice,
      publicAccess: !form.inviteOnly,
    };
    const payload = resolved.type === "photo"
      ? { ...photoBody(), ...accessFields }
      : resolved.type === "article"
        ? { ...resolved, media: JSON.stringify(embeddedMedia), ...accessFields }
        : { ...resolved, ...accessFields };
    apiAuthFetch(`/blog/admin/posts/${postId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    })
      .then((data: any) => {
        const cutOff = Array.isArray(data.post?.cutOffWallets) ? data.post.cutOffWallets : [];
        if (cutOff.length > 0 && form.inviteOnly) {
          const n = cutOff.length;
          alert(`Made invite-only. ${n} wallet${n === 1 ? "" : "s"} that paid outside the whitelist ${n === 1 ? "was" : "were"} revoked and refund-marked (bookkeeping).`);
        }
        router.push("/admin/posts");
      })
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

      <Field label="Title" required>
        <input
          type="text" value={form.title} onChange={(e) => handleTitleChange(e.target.value)} required
          className="input-field"
          placeholder={form.type === "photo" ? "Photo title" : form.type === "video" ? "Video title" : form.type === "music" ? "Track title" : form.type === "document" ? "Document title" : "Post title"}
        />
      </Field>

      <Field label="Slug">
        <input
          type="text" value={form.slug} maxLength={90}
          onChange={(e) => { slugEdited.current = true; update("slug", generateSlug(e.target.value)); }}
          className="input-field font-mono" placeholder="auto-generated-from-title"
        />
      </Field>

      <Field label="Type" required>
        <select value={form.type} onChange={(e) => update("type", e.target.value)} className="input-field">
          <option value="article">Article</option>
          <option value="photo">Photo</option>
          <option value="video">Video</option>
          <option value="music">Music</option>
          <option value="document">Document</option>
        </select>
      </Field>

      {form.type === "article" && (
        <MarkdownEditor
          required value={form.bodyMarkdown} onChange={(v) => update("bodyMarkdown", v)}
          embeddedMedia={embeddedMedia}
          onEmbeddedMediaChange={setEmbeddedMedia}
        />
      )}
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
          <Field label="Photos" required>
            <ImageUploader
              encrypted
              allowCover
              coverKey={coverKey}
              onCoverChange={handleCoverChange}
              value={form.media ? JSON.parse(form.media) : []}
              onChange={(items) => setForm(p => ({ ...p, media: JSON.stringify(items) }))}
            />
            {!form.coverUrl && !coverKey && (
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
          <Field label="Upload a video file">
            <VideoUploader
              encrypted
              onUpload={handleVideoUpload}
              existingName={form.videoName || (form.videoStorageRef ? "Encrypted file" : "")}
            />
          </Field>
          <Field label="Or paste a YouTube URL">
            <input
              type="text" value={form.videoUrl} onChange={(e) => update("videoUrl", e.target.value)}
              className="input-field" placeholder="https://www.youtube.com/watch?v=..."
            />
          </Field>
          <Field label="Cover Image">
            <ImageUploader
              maxFiles={1}
              value={form.coverUrl ? [{ url: form.coverUrl, caption: "" }] : []}
              onChange={(items) => update("coverUrl", items[0]?.url || "")}
            />
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>
              Optional — defaults to the YouTube thumbnail if a link is provided.
            </div>
          </Field>
          {vid && !form.videoStorageRef && (
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
          <Field label="Audio File" required>
            <AudioUploader
              encrypted
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

      {form.type === "document" && (
        <>
          <Field label="Cover Image">
            <ImageUploader
              maxFiles={1}
              value={form.coverUrl ? [{ url: form.coverUrl, caption: "" }] : []}
              onChange={(items) => update("coverUrl", items[0]?.url || "")}
            />
          </Field>
          <Field label="Document File" required>
            <DocumentUploader
              encrypted
              onUpload={handleDocumentUpload}
              existingName={form.documentName || (form.documentStorageRef ? "Encrypted file" : "")}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.excerpt} onChange={(e) => update("excerpt", e.target.value)}
              rows={3} className="input-field" placeholder="Describe this document..."
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

      <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <FiUsers size={12} style={{ color: "var(--muted)" }} />
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Whitelist & invite</span>
          <span className="text-[10px] ml-auto" style={{ color: "var(--muted)" }}>{form.whitelist.length} wallet{form.whitelist.length === 1 ? "" : "s"}</span>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer mb-2" style={{ color: "var(--fg)" }}>
          <input
            type="checkbox" checked={form.inviteOnly} onChange={(e) => update("inviteOnly", e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Invite only — <span style={{ color: "var(--muted)" }}>nobody outside the whitelist can unlock, even if they pay</span>
        </label>

        <WalletListEditor
          value={form.whitelist}
          onChange={(next) => update("whitelist", next)}
          compact
        />

        {form.whitelist.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] shrink-0" style={{ color: "var(--muted)" }}>Whitelisted pay</span>
              <select
                value={form.whitelistPrice === "" ? "__public" : "0" === form.whitelistPrice ? "__free" : "__custom"}
                onChange={(e) => {
                  const v = e.target.value;
                  update("whitelistPrice", v === "__public" ? "" : v === "__free" ? "0" : form.whitelistPrice);
                }}
                className="input-field flex-1 text-xs py-1.5"
              >
                <option value="__public">same as public price</option>
                <option value="__free">free (0)</option>
                <option value="__custom">custom price…</option>
              </select>
            </div>
            {form.whitelistPrice !== "" && form.whitelistPrice !== "0" && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] shrink-0" style={{ color: "var(--muted)" }}>Custom tier</span>
                <input
                  type="text" inputMode="decimal" value={form.whitelistPrice}
                  onChange={(e) => update("whitelistPrice", e.target.value)}
                  className="input-field flex-1" placeholder="e.g. 0.50"
                />
                <span className="text-xs font-semibold shrink-0" style={{ color: "var(--muted)" }}>USDC</span>
              </div>
            )}
          </div>
        )}
      </div>

      <GatePreview
        isPaid={!!form.price && form.price !== "0"}
        inviteOnly={form.inviteOnly}
        publicPrice={Number(form.price) || 0}
        hasWhitelist={form.whitelist.length > 0}
        whitelistPrice={form.whitelistPrice}
        previewAs={previewAs}
        onPreviewAs={setPreviewAs}
      />

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

function GatePreview({ isPaid, inviteOnly, publicPrice, hasWhitelist, whitelistPrice, previewAs, onPreviewAs }: {
  isPaid: boolean;
  inviteOnly: boolean;
  publicPrice: number;
  hasWhitelist: boolean;
  whitelistPrice: string;
  previewAs: "public" | "whitelisted";
  onPreviewAs: (v: "public" | "whitelisted") => void;
}) {
  const wlTier = previewAs === "whitelisted" ? (() => {
    const t = Number(whitelistPrice);
    return Number.isFinite(t) ? t : publicPrice;
  })() : publicPrice;
  const discounted = Number.isFinite(Number(whitelistPrice)) && whitelistPrice !== "" && Number(whitelistPrice) < publicPrice && publicPrice > 0;
  const freeNow = !isPaid || (previewAs === "whitelisted" && Number(whitelistPrice) === 0);

  return (
    <div className="rounded-md border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>
          <FiEye className="inline mr-1" size={11} /> What visitors will see
        </span>
        {hasWhitelist && (
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            {(["public", "whitelisted"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onPreviewAs(kind)}
                className="text-[10px] font-semibold px-2 py-0.5 cursor-pointer"
                style={previewAs === kind ? { background: "var(--accent)", color: "#fff" } : { background: "transparent", color: "var(--muted)" }}
              >
                {kind === "public" ? "Visitor" : "Whitelisted"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", padding: "12px 8px 4px" }}>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>
          {freeNow ? "Free" : (
            <>
              {formatUsd(wlTier)} <span style={{ fontSize: 16, fontWeight: 600, color: "var(--muted)" }}>USDC</span>
            </>
          )}
        </div>
        {discounted && (
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            <span style={{ textDecoration: "line-through" }}>{formatUsd(publicPrice)}</span>{" "}
            <span style={{ color: "#7c9a6d", fontWeight: 600 }}>whitelisted price</span>
          </div>
        )}
        <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 6 }}>Pay to unlock this content</div>
        <div style={{ margin: "14px auto 0", maxWidth: 280, borderRadius: 10, padding: "13px 0", fontWeight: 600, fontSize: 16, color: "#fff", background: "var(--accent)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {freeNow ? "Unlock for free" : "Hold to pay"}
        </div>
        {inviteOnly && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#b45309", fontWeight: 600 }}>
            🔒 Invite only — whitelisted wallets can unlock
          </div>
        )}
        {!inviteOnly && hasWhitelist && previewAs === "public" && !freeNow && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Whitelisted wallets may pay a different price
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}{required && <span style={{ color: "#c44" }}> *</span>}</label>
      {children}
    </div>
  );
}
