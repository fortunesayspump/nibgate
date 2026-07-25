"use client";

import { useState, useRef } from "react";
import { apiUrl } from "@/lib/api";

interface MediaItem {
  url: string;
  caption: string;
}

interface ImageUploaderProps {
  multiple?: boolean;
  value?: MediaItem[];
  onChange?: (items: MediaItem[]) => void;
  maxFiles?: number;
}

export default function ImageUploader({
  multiple = true,
  value = [],
  onChange,
  maxFiles = 20,
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
        const res = await fetch(apiUrl("/upload"), {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        const updated = [...value, { url: data.url, caption: "" }];
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

  function removeItem(index: number) {
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
          {value.map((item, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ position: "relative", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "1" }}>
                <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
          ))}
        </div>
      )}
    </div>
  );
}
