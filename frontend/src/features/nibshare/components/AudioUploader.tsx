"use client";

import { useState, useRef } from "react";
import type { ContentMedia } from "../types";
import { uploadJson } from "../lib/upload";

const UPLOAD_URL = "/uploads/content";

interface AudioUploaderProps {
  onUpload: (result: ContentMedia) => void;
  existingUrl?: string;
}

export default function AudioUploader({ onUpload, existingUrl }: AudioUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState(existingUrl ? "Existing file" : "");
  const [fileSize, setFileSize] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    if (file.size > 30 * 1024 * 1024) {
      setError("Audio files must be 30MB or smaller");
      return;
    }
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i)) {
      setError("Only audio files are supported");
      return;
    }
    setFileName(file.name);
    setFileSize(formatSize(file.size));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await uploadJson(`${UPLOAD_URL}?encrypted=1`, fd);
      onUpload({ storageRef: data.storageRef, encryptedKey: data.encryptedKey, contentType: data.contentType });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "8px", padding: "24px 16px", textAlign: "center",
          cursor: "pointer", background: dragOver ? "var(--accent-soft)" : "transparent",
          transition: "all 0.15s", fontSize: "14px", color: "var(--muted)",
        }}
      >
        {uploading ? "Uploading audio..." : "Drag & drop audio file here, or click to select"}
      </div>
      <input
        ref={inputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a,.wma"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (e.target) e.target.value = ""; }}
      />
      {(fileName || error) && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 12px", borderRadius: "6px",
          border: "1px solid var(--border)", fontSize: "13px",
        }}>
          <span style={{ fontWeight: 500 }}>{fileName}</span>
          {fileSize && <span style={{ color: "var(--muted)" }}>({fileSize})</span>}
        </div>
      )}
      {error && <div style={{ fontSize: "13px", color: "#dc2626" }}>{error}</div>}
    </div>
  );
}
