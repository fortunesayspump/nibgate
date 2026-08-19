'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiDollarSign, FiUsers, FiEye } from 'react-icons/fi';
import MarkdownEditor from './MarkdownEditor';
import ImageUploader from './ImageUploader';
import AudioUploader from './AudioUploader';
import DocumentUploader from './DocumentUploader';
import VideoUploader from './VideoUploader';
import { WalletListEditor } from './WalletListEditor';
import { nibshareApi } from '../api';
import { ShareSuccess } from './ShareSuccess';
import { formatUsd } from '../lib/shares';
import type { ContentMedia, CreateShareResponse, EditSharePayload } from '../types';
import type { MediaItem } from '../lib/content';
import { parseContent } from '../lib/content';

interface ShareFormData {
  title: string;
  slug: string;
  bodyMarkdown: string;
  excerpt: string;
  tags: string;
  coverUrl: string;
  videoUrl: string;
  price: string;
  recipientWallet: string;
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
  videoStorageRef: string;
  videoEncryptedKey: string;
  videoContentType: string;
  videoName: string;
  videoSize: number | null;
  media: string;
  whitelist: string[];
  whitelistPrice: string;
  inviteOnly: boolean;
}

const defaults: ShareFormData = {
  title: "", slug: "", bodyMarkdown: "", excerpt: "",
  tags: "", coverUrl: "", videoUrl: "",
  price: "", recipientWallet: "", type: "article",
  audioUrl: "", audioStorageRef: "", audioEncryptedKey: "", audioContentType: "",
  documentUrl: "", documentName: "", documentSize: null, documentStorageRef: "", documentEncryptedKey: "", documentContentType: "",
  videoStorageRef: "", videoEncryptedKey: "", videoContentType: "", videoName: "", videoSize: null,
  media: "",
  whitelist: [], whitelistPrice: "", inviteOnly: false,
};

export default function ShareForm({ defaultRecipientWallet, authenticated = false, connecting = false, onConnect, editing }: {
  defaultRecipientWallet?: string;
  authenticated?: boolean;
  connecting?: boolean;
  onConnect?: () => void;
  editing?: { slug: string; initial: EditSharePayload };
}) {
  const router = useRouter();

  function initForm(): ShareFormData {
    if (!editing) return { ...defaults, recipientWallet: defaultRecipientWallet ?? "" };
    const p = editing.initial;
    const next: ShareFormData = { ...defaults, recipientWallet: defaultRecipientWallet ?? "" };
    next.title = p.title;
    next.slug = p.slug;
    next.excerpt = p.summary ?? "";
    next.coverUrl = p.coverUrl ?? "";
    next.price = p.price !== "0" ? p.price : "";
    next.whitelist = p.whitelist ?? [];
    next.whitelistPrice = p.whitelistPrice ?? "";
    next.inviteOnly = p.publicAccess === false;

    const view = parseContent(p.content);
    if (p.contentType === "photo") {
      next.type = "photo";
      if (view && view.kind === "photo") {
        const items = view.media.map((m) => ({ _fileKey: m.storageRef || m.url || "", ...m }));
        next.media = JSON.stringify(items);
        next.coverUrl = view.coverUrl ?? "";
        next.excerpt = view.caption ?? "";
      }
    } else if (p.contentType === "video") {
      next.type = "video";
      if (view && view.kind === "video") {
        next.videoUrl = view.videoUrl ?? "";
        next.excerpt = view.caption ?? "";
        if (view.file) {
          next.videoStorageRef = view.file.storageRef ?? "";
          next.videoEncryptedKey = view.file.encryptedKey ?? "";
          next.videoContentType = view.file.contentType ?? "";
          next.videoName = view.file.name ?? "";
          next.videoSize = view.file.size ?? null;
        }
      }
    } else if (p.contentType === "music") {
      next.type = "music";
      if (view && view.kind === "music") {
        next.coverUrl = view.coverUrl ?? "";
        next.excerpt = view.caption ?? "";
        if (view.audio) {
          next.audioUrl = view.audio.url ?? "";
          next.audioStorageRef = view.audio.storageRef ?? "";
          next.audioEncryptedKey = view.audio.encryptedKey ?? "";
          next.audioContentType = view.audio.contentType ?? "";
        }
      }
    } else if (p.contentType === "document") {
      next.type = "document";
      if (view && view.kind === "document") {
        next.coverUrl = view.coverUrl ?? "";
        next.excerpt = view.caption ?? "";
        if (view.doc) {
          next.documentUrl = view.doc.url ?? "";
          next.documentName = view.doc.name ?? "";
          next.documentSize = view.doc.size ?? null;
          next.documentStorageRef = view.doc.storageRef ?? "";
          next.documentEncryptedKey = view.doc.encryptedKey ?? "";
          next.documentContentType = view.doc.contentType ?? "";
        }
      }
    } else {
      next.type = "article";
      if (view && view.kind === "markdown") next.bodyMarkdown = view.markdown;
    }
    return next;
  }

  function initMedia(): MediaItem[] {
    if (!editing) return [];
    const view = parseContent(editing.initial.content);
    return view && view.kind === "markdown" ? view.media : [];
  }

  function initExpiryQuick(): number | null {
    if (!editing || !editing.initial.expiresAt) return 168;
    return null;
  }

  function initCustomExpiry(): string {
    if (!editing || !editing.initial.expiresAt) return "";
    return toLocalInput(new Date(editing.initial.expiresAt));
  }

  function initCoverKey(): string {
    if (!editing || editing.initial.contentType !== "photo") return "";
    const view = parseContent(editing.initial.content);
    return view && view.kind === "photo" ? (view.coverUrl ?? "") : "";
  }

  const [form, setForm] = useState<ShareFormData>(initForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState<CreateShareResponse | null>(null);
  const [coverKey, setCoverKey] = useState(initCoverKey);
  const [embeddedMedia, setEmbeddedMedia] = useState<MediaItem[]>(initMedia);
  const [expiryQuick, setExpiryQuick] = useState<number | null>(initExpiryQuick);
  const [customExpiry, setCustomExpiry] = useState(initCustomExpiry);
  const [previewAs, setPreviewAs] = useState<"public" | "whitelisted">("public");
  // While the user is typing a price we must NOT reinterpret an empty value as
  // "free" and yank the mode back — only revert to free when they blur an empty
  // price input.
  const [priceFocused, setPriceFocused] = useState(false);

  const invitationEnabled = form.inviteOnly || form.whitelist.length > 0 || form.whitelistPrice.trim() !== "";

  useEffect(() => {
    if (defaultRecipientWallet && !form.recipientWallet) {
      setForm((prev) => ({ ...prev, recipientWallet: defaultRecipientWallet ?? "" }));
    }
  }, [defaultRecipientWallet, form.recipientWallet]);

  function toLocalInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const MAX_EXPIRY_MS = 168 * 3600e3;
  const expiryMin = toLocalInput(new Date(Date.now() + 5 * 60e3));
  const expiryMax = toLocalInput(new Date(Date.now() + MAX_EXPIRY_MS));

  function computeExpiryIso(): string {
    const base = expiryQuick !== null ? Date.now() + expiryQuick * 3600e3 : customExpiry ? new Date(customExpiry).getTime() : Date.now() + MAX_EXPIRY_MS;
    const clamped = Math.min(Math.max(base, Date.now() + 5 * 60e3), Date.now() + MAX_EXPIRY_MS);
    return new Date(clamped).toISOString();
  }

  function generateSlug(title: string): string {
    return title.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
  }

  function handleTitleChange(value: string) {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: generateSlug(value),
    }));
  }

  function update<K extends keyof ShareFormData>(key: K, value: ShareFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getYoutubeId(url: string): string | null {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  const isPaid = !!form.price && form.price !== "0";
  // Pay mode stays "paid" while the price input is focused so clearing the
  // field to type a new first digit doesn't snap back to Free mid-typing.
  const showPaid = isPaid || priceFocused;
  function canPublish(): { ok: boolean; reason?: string } {
    if (!form.title) return { ok: false, reason: "Title is required" };
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
    if (isPaid) {
      const n = parseFloat(form.price);
      if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "Enter a valid price in USDC" };
      if (!form.recipientWallet) return { ok: false, reason: "Recipient wallet is required for paid posts" };
    }
    const addrRe = /^0x[a-fA-F0-9]{40}$/;
    for (const w of form.whitelist) {
      if (!addrRe.test(w)) return { ok: false, reason: `Invalid wallet address: ${w}` };
    }
    if (form.whitelistPrice.trim() !== "") {
      const n = Number(form.whitelistPrice);
      if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "Whitelist price must be a non-negative number" };
    }
    if (form.inviteOnly && form.whitelist.length === 0) {
      return { ok: false, reason: "Invite-only needs at least one whitelisted wallet" };
    }
    return { ok: true };
  }

  // Drafts only need enough to be identifiable and re-opened: a title and no
  // malformed wallet entries. Body/media/price can be filled in later — the
  // whole point of a draft is saving partial work.
  function canDraft(): { ok: boolean; reason?: string } {
    if (!form.title) return { ok: false, reason: "Title is required" };
    const addrRe = /^0x[a-fA-F0-9]{40}$/;
    for (const w of form.whitelist) {
      if (!addrRe.test(w)) return { ok: false, reason: `Invalid wallet address: ${w}` };
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
    return items.map(({ _fileKey, previewUrl, ...m }) => m);
  }

  function buildContent() {
    if (form.type === "article") {
      return embeddedMedia.length > 0
        ? { type: "article", markdown: form.bodyMarkdown, media: embeddedMedia.map(({ previewUrl, ...m }) => m) }
        : form.bodyMarkdown;
    }
    if (form.type === "photo") {
      return { type: "photo", media: buildPhotoPayload(), coverUrl: form.coverUrl, coverKey, caption: form.excerpt };
    }
    if (form.type === "video") {
      return {
        type: "video",
        url: form.videoUrl || null,
        file: form.videoStorageRef
          ? { storageRef: form.videoStorageRef, encryptedKey: form.videoEncryptedKey, contentType: form.videoContentType, name: form.videoName, size: form.videoSize }
          : null,
        caption: form.excerpt,
      };
    }
    if (form.type === "music") {
      return {
        type: "music",
        coverUrl: form.coverUrl,
        audio: form.audioStorageRef
          ? { storageRef: form.audioStorageRef, encryptedKey: form.audioEncryptedKey, contentType: form.audioContentType }
          : { url: form.audioUrl },
        caption: form.excerpt,
      };
    }
    return {
      type: "document",
      coverUrl: form.coverUrl,
      document: form.documentStorageRef
        ? { storageRef: form.documentStorageRef, encryptedKey: form.documentEncryptedKey, contentType: form.documentContentType, name: form.documentName, size: form.documentSize }
        : { url: form.documentUrl, name: form.documentName, size: form.documentSize },
      caption: form.excerpt,
    };
  }

  function createShare(status: 'active' | 'draft') {
    setError("");
    setSaving(true);
    const videoCover = form.type === "video" && vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : "";
    const payload = {
      title: form.title,
      summary: form.excerpt,
      coverUrl: form.coverUrl || videoCover || null,
      contentType: form.type,
      content: buildContent(),
      price: isPaid ? form.price : "0",
      status,
      expiresAt: computeExpiryIso(),
      whitelist: form.whitelist,
      whitelistPrice: form.whitelistPrice.trim() === "" ? null : form.whitelistPrice,
      publicAccess: !form.inviteOnly,
    };
    const save = editing
      ? nibshareApi.update(editing.slug, payload)
      : nibshareApi.create(payload);
    save
      .then((res) => {
        if (status === 'active') {
          setPublished(res);
        } else {
          router.push("/share/mine");
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to save"))
      .finally(() => setSaving(false));
  }

  function handleAudioUpload(result: ContentMedia) {
    if (result.storageRef) {
      setForm((prev) => ({ ...prev, audioUrl: "", audioStorageRef: result.storageRef!, audioEncryptedKey: result.encryptedKey || "", audioContentType: result.contentType || "" }));
    } else {
      setForm((prev) => ({ ...prev, audioUrl: result.url || "", audioStorageRef: "", audioEncryptedKey: "", audioContentType: "" }));
    }
  }

  function handleDocumentUpload(result: ContentMedia) {
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

  function handleVideoUpload(result: ContentMedia) {
    setForm((prev) => ({
      ...prev,
      videoStorageRef: result.storageRef || "",
      videoEncryptedKey: result.encryptedKey || "",
      videoContentType: result.contentType || "",
      videoName: result.name || prev.videoName,
      videoSize: result.size ?? prev.videoSize,
    }));
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
          authenticated={authenticated}
          onConnect={onConnect}
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
            authenticated={authenticated}
            onConnect={onConnect}
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
              authenticated={authenticated}
              onConnect={onConnect}
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
              onUpload={handleVideoUpload}
              existingName={form.videoName || (form.videoStorageRef ? "Encrypted file" : "")}
              authenticated={authenticated}
              onConnect={onConnect}
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
              authenticated={authenticated}
              onConnect={onConnect}
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
              authenticated={authenticated}
              onConnect={onConnect}
            />
          </Field>
          <Field label="Audio File" required>
            <AudioUploader
              onUpload={handleAudioUpload}
              existingUrl={form.audioUrl || (form.audioStorageRef ? "Encrypted file" : "")}
              authenticated={authenticated}
              onConnect={onConnect}
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
              authenticated={authenticated}
              onConnect={onConnect}
            />
          </Field>
          <Field label="Document File" required>
            <DocumentUploader
              onUpload={handleDocumentUpload}
              existingName={form.documentName || (form.documentStorageRef ? "Encrypted file" : "")}
              authenticated={authenticated}
              onConnect={onConnect}
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

      {/* ---- Price & access ---- */}
      <div className="rounded-md border p-3 space-y-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-1.5">
          <FiDollarSign size={12} style={{ color: "var(--muted)" }} />
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>
            {showPaid ? (invitationEnabled ? "Price & access" : "Price") : invitationEnabled ? "Access" : "Price & access"}
          </span>
        </div>

        <div>
          <div className="grid grid-cols-1 gap-2">
            {[
              { key: "free" as const, title: "Free", desc: "Anyone with the link can read it. No payment." },
              { key: "paid" as const, title: "Pay to unlock", desc: "Visitors pay a one-time USDC price to see it." },
            ].map((opt) => {
              const active = opt.key === "paid" ? showPaid : !showPaid;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    if (opt.key === "paid" && !showPaid) update("price", form.price || "1");
                    if (opt.key === "free" && showPaid) { update("price", ""); setPriceFocused(false); }
                  }}
                  className="rounded-lg border p-3 text-left cursor-pointer transition-colors"
                  style={active
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)", boxShadow: "0 0 0 1px var(--accent)" }
                    : { borderColor: "var(--border)", background: "transparent" }}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{opt.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: active ? "var(--accent)" : "var(--muted)" }}>{active ? "●" : "○"}</span>
                  </span>
                  <span className="block text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {showPaid && (
          <div className="space-y-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <input
                type="text" inputMode="decimal" value={form.price} onChange={(e) => update("price", e.target.value)}
                onFocus={() => setPriceFocused(true)}
                onBlur={() => { setPriceFocused(false); if (!form.price) update("price", ""); }}
                className="input-field flex-1" placeholder="e.g. 1" aria-label="Price in USDC"
              />
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--muted)" }}>USDC</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] shrink-0" style={{ color: "var(--muted)" }}>Pays to</span>
              <input
                type="text" value={form.recipientWallet} onChange={(e) => update("recipientWallet", e.target.value)}
                className="input-field font-mono flex-1 min-w-0" placeholder="0x… your wallet"
                spellCheck={false}
              />
            </div>
          </div>
        )}

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
                    if (v === "__public") update("whitelistPrice", "");
                    else if (v === "__free") update("whitelistPrice", "0");
                    else update("whitelistPrice", form.whitelistPrice && form.whitelistPrice !== "0" ? form.whitelistPrice : (isPaid ? form.price : "1"));
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
      </div>

      {/* ---- Live "what visitors see" preview ---- */}
      <GatePreview
        isPaid={isPaid}
        inviteOnly={form.inviteOnly}
        publicPrice={Number(form.price) || 0}
        hasWhitelist={form.whitelist.length > 0}
        whitelistPrice={form.whitelistPrice}
        previewAs={previewAs}
        onPreviewAs={setPreviewAs}
      />

      <Field label="Expires">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {[
            { h: 24, label: "24 hours" },
            { h: 72, label: "3 days" },
            { h: 168, label: "7 days" },
          ].map(({ h, label }) => (
            <button
              key={h}
              type="button"
              onClick={() => { setExpiryQuick(h); setCustomExpiry(""); }}
              style={{
                padding: "6px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer",
                border: `1px solid ${expiryQuick === h ? "var(--accent)" : "var(--border)"}`,
                background: expiryQuick === h ? "var(--accent)" : "transparent",
                color: expiryQuick === h ? "#fff" : "var(--fg)",
              }}
            >
              {label}
            </button>
          ))}
          <span style={{ fontSize: "13px", color: "var(--muted)" }}>or</span>
          <input
            type="datetime-local"
            value={customExpiry}
            min={expiryMin}
            max={expiryMax}
            onChange={(e) => { setCustomExpiry(e.target.value); setExpiryQuick(null); }}
            style={{
              padding: "6px 10px", borderRadius: "6px", fontSize: "13px",
              border: `1px solid ${expiryQuick === null && customExpiry ? "var(--accent)" : "var(--border)"}`,
              background: "transparent", color: "inherit", colorScheme: "dark",
            }}
          />
        </div>
        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
          Shares expire automatically — max 7 days from now.
        </div>
      </Field>

      <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => (authenticated ? createShare('active') : onConnect?.())}
          disabled={connecting || saving || (authenticated && !canPublish().ok)}
          className="btn-primary"
          title={!authenticated ? "Connect your wallet to publish" : canPublish().ok ? "" : canPublish().reason}
        >
          {connecting ? "Connecting..." : authenticated ? (saving ? "Publishing..." : "Publish") : "Connect wallet to publish"}
        </button>
        <button
          type="button"
          onClick={() => (authenticated ? createShare('draft') : onConnect?.())}
          disabled={connecting || saving || (authenticated && !canDraft().ok)}
          className="btn-secondary"
          title={!authenticated ? "Connect your wallet to save a draft" : canDraft().ok ? "Save an in-progress post to finish later" : canDraft().reason}
        >
          {connecting ? "Connecting..." : authenticated ? "Save as Draft" : "Connect wallet"}
        </button>
      </div>
      {!authenticated && (
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          You can write your post first — connecting a wallet is only needed to publish.
        </p>
      )}

      {published && (
        <ShareSuccess
          slug={published.slug}
          url={published.url}
          title={published.title}
          price={published.price}
          expiresAt={published.expiresAt}
          saved={!!editing}
          onDone={() => router.push("/share/mine")}
        />
      )}
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
