"use client";

import { useState, useRef } from "react";
import type { ContentMedia } from "../types";
import { uploadJson } from "../lib/upload";

const UPLOAD_URL = "/uploads/content";
const VIDEO_RE = /\.(mp4|webm|mov|mkv)$/i;

interface VideoUploaderProps {
  onUpload: (result: ContentMedia) => void;
  existingName?: string;
  authenticated?: boolean;
  onConnect?: () => void;
}

export default function VideoUploader({ onUpload, existingName, authenticated = true, onConnect }: VideoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState(existingName ? existingName : "");
  const [fileSize, setFileSize] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function requireAuth(): boolean {
    if (authenticated) return true;
    onConnect?.();
    return false;
  }

  async function handleFile(file: File) {
    setError("");
    if (!file.type.startsWith("video/") && !file.name.match(VIDEO_RE)) {
      setError("Only video files (mp4, webm, mov, mkv) are supported");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError("Videos must be 30MB or smaller");
      return;
    }
    setFileName(file.name);
    setFileSize(formatSize(file.size));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await uploadJson(`${UPLOAD_URL}?encrypted=1`, fd);
      onUpload({ storageRef: data.storageRef, encryptedKey: data.encryptedKey, contentType: data.contentType, name: data.name, size: data.size });
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
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!requireAuth()) return; const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        onClick={() => { if (requireAuth()) inputRef.current?.click(); }}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "8px", padding: "24px 16px", textAlign: "center",
          cursor: "pointer", background: dragOver ? "var(--accent-soft)" : "transparent",
          transition: "all 0.15s", fontSize: "14px", color: "var(--muted)",
        }}
      >
        {uploading ? "Uploading video..." : authenticated ? "Drag & drop a video here (max 30MB), or click to select" : "Connect wallet to add video"}
      </div>
      <input
        ref={inputRef} type="file" accept="video/*,.mp4,.webm,.mov,.mkv"
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
