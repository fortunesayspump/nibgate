"use client";

import { useState, useRef } from "react";
import { apiUrl } from "@/lib/api";

interface MediaItem {
  url?: string;
  storageRef?: string | null;
  encryptedKey?: string | null;
  contentType?: string;
  caption: string;
}

interface ImageUploaderProps {
  multiple?: boolean;
  value?: MediaItem[];
  onChange?: (items: MediaItem[]) => void;
  maxFiles?: number;
  encrypted?: boolean;
  allowCover?: boolean;
  coverKey?: string;
  onCoverChange?: (coverUrl: string, coverKey: string) => void;
}

export default function ImageUploader({
  multiple = true,
  value = [],
  onChange,
  maxFiles = 20,
  encrypted = false,
  allowCover = false,
  coverKey = "",
  onCoverChange,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState<Record<string, { loading: boolean; error?: string }>>({});
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(fileList: FileList | File[]) {
    const fileArray = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;
    const remaining = maxFiles - value.length;
    if (fileArray.length > remaining) return;

    for (const file of fileArray) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setUploading((prev) => ({ ...prev, [tempId]: { loading: true } }));

      try {
        const token = localStorage.getItem("token");
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(apiUrl(encrypted ? "/upload?encrypted=1" : "/upload"), {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        const item: MediaItem = encrypted
          ? { storageRef: data.storageRef, encryptedKey: data.encryptedKey, contentType: data.contentType, caption: "" }
          : { url: data.url, caption: "" };
        const updated = [...value, item];
        onChange?.(updated);
        setUploading((prev) => {
          const next = { ...prev };
          delete next[tempId];
          return next;
        });
      } catch (err) {
        setUploading((prev) => ({
          ...prev,
          [tempId]: { loading: false, error: err instanceof Error ? err.message : "Upload failed" },
        }));
      }
    }
  }

  function handleCoverSelect(index: number) {
    const item = value[index];
    if (!item || !onCoverChange) return;
    const key = item.storageRef || item.url || "";
    if (key && key === coverKey) {
      onCoverChange("", "");
      return;
    }
    onCoverChange(item.url || "", key);
  }

  function removeItem(index: number) {
    const item = value[index];
    const key = item?.storageRef || item?.url || "";
    if (key && key === coverKey) onCoverChange?.("", "");
    const updated = value.filter((_, i) => i !== index);
    onChange?.(updated);
  }

  function updateCaption(index: number, caption: string) {
    const updated = value.map((item, i) => (i === index ? { ...item, caption } : item));
    onChange?.(updated);
  }

  const uploadingItems = Object.entries(uploading).filter(([, v]) => v.loading);
  const errors = Object.values(uploading).filter((v) => !v.loading && v.error);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "8px", padding: "32px 16px", textAlign: "center",
          cursor: "pointer", background: dragOver ? "var(--accent-soft)" : "transparent",
          transition: "all 0.15s", fontSize: "14px", color: "var(--muted)",
        }}
      >
        {dragOver ? "Drop images here" : "Click or drag to add photos"}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); if (e.target) e.target.value = ""; }}
      />

      {uploadingItems.length > 0 && (
        <div style={{ fontSize: "13px", color: "var(--muted)", padding: "4px 0" }}>
          Uploading {uploadingItems.length} file(s)...
        </div>
      )}

      {errors.map((e, i) => (
        <div key={i} style={{ fontSize: "13px", color: "#dc2626" }}>{e.error}</div>
      ))}

      {value.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
          {value.map((item, i) => {
            const isCover = !!coverKey && (item.storageRef || item.url) === coverKey;
            return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ position: "relative", borderRadius: "6px", overflow: "hidden", border: `1px solid ${isCover ? "var(--accent)" : "var(--border)"}`, aspectRatio: "1" }}>
                {item.url ? (
                  <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--muted)", background: "var(--surface)" }}>
                    Encrypted
                  </div>
                )}
                {isCover && (
                  <div style={{ position: "absolute", top: "4px", left: "4px", background: "var(--accent)", color: "#fff", fontSize: "10px", fontWeight: 600, borderRadius: "4px", padding: "2px 6px", letterSpacing: "0.03em" }}>
                    Cover
                  </div>
                )}
                {allowCover && (
                  <button
                    type="button"
                    title="Set as cover"
                    onClick={() => handleCoverSelect(i)}
                    style={{
                      position: "absolute", bottom: "4px", left: "4px",
                      width: "28px", height: "28px", borderRadius: "50%",
                      border: `1px solid ${isCover ? "transparent" : "rgba(255,255,255,0.5)"}`,
                      background: isCover ? "var(--accent)" : "rgba(0,0,0,0.45)",
                      color: isCover ? "#fff" : "rgba(255,255,255,0.85)",
                      fontSize: "15px", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", lineHeight: 1,
                    }}
                  >
                    {isCover ? "\u2605" : "\u2606"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  style={{
                    position: "absolute", top: "4px", right: "4px",
                    width: "24px", height: "24px", borderRadius: "50%",
                    border: "none", background: "rgba(0,0,0,0.6)", color: "#fff",
                    fontSize: "16px", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
              <input
                type="text"
                value={item.caption}
                onChange={(e) => updateCaption(i, e.target.value)}
                placeholder="Caption..."
                style={{
                  width: "100%", padding: "4px 8px", fontSize: "12px",
                  border: "1px solid var(--border)", borderRadius: "4px",
                  background: "transparent", color: "inherit", boxSizing: "border-box",
                }}
              />
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
