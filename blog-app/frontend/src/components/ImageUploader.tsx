"use client";

import { useState, useRef, type DragEvent } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface UploadedImage {
  file: File;
  url: string;
  uploading: boolean;
  error?: string;
}

interface ImageUploaderProps {
  maxFiles?: number;
  onImagesChange: (urls: string[]) => void;
  existingUrls?: string[];
}

export default function ImageUploader({ maxFiles = 10, onImagesChange, existingUrls = [] }: ImageUploaderProps) {
  const [images, setImages] = useState<UploadedImage[]>(
    existingUrls.map((url) => ({ file: new File([], ""), url, uploading: false }))
  );
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(fileList: FileList | File[]) {
    setError("");
    const fileArray = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) { setError("Only image files are supported"); return; }
    const remaining = maxFiles - images.length;
    if (fileArray.length > remaining) { setError(`Only ${remaining} more image(s) allowed`); return; }

    const newImages = [...images, ...fileArray.map((f) => ({ file: f, url: "", uploading: true }))];
    setImages(newImages);

    for (const file of fileArray) {
      try {
        const token = localStorage.getItem("token");
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${API}/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setImages((prev) => {
          const updated = prev.map((img) => img.file === file ? { ...img, url: data.url, uploading: false } : img);
          onImagesChange(updated.filter((img) => img.url).map((img) => img.url));
          return updated;
        });
      } catch (err: unknown) {
        setImages((prev) => {
          const updated = prev.map((img) =>
            img.file === file ? { ...img, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : img
          );
          return updated;
        });
      }
    }
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      onImagesChange(updated.filter((img) => img.url).map((img) => img.url));
      return updated;
    });
  }

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
        {dragOver ? "Drop images here" : "Drag & drop images here, or click to select"}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" multiple
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); if (e.target) e.target.value = ""; }}
      />
      {error && <div style={{ fontSize: "13px", color: "#dc2626" }}>{error}</div>}
      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px" }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border)" }}>
              {img.uploading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "12px", color: "var(--muted)" }}>
                  Uploading...
                </div>
              ) : img.url ? (
                <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "12px", color: "#dc2626", padding: "4px", textAlign: "center" }}>
                  {img.error || "Error"}
                </div>
              )}
              {img.url && !img.uploading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  style={{
                    position: "absolute", top: "4px", right: "4px",
                    width: "22px", height: "22px", borderRadius: "50%",
                    border: "none", background: "rgba(0,0,0,0.6)", color: "#fff",
                    fontSize: "14px", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
