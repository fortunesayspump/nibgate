"use client";

import { useState, useRef } from "react";
import { uploadJson } from "@/lib/upload";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const DOC_EXTS = /\.(pdf|xlsx|xls|csv|ods|docx|doc|txt|md)$/i;

interface DocumentUploaderProps {
  onUpload: (result: { url?: string; storageRef?: string; encryptedKey?: string; contentType?: string; name?: string; size?: number }) => void;
  existingName?: string;
  encrypted?: boolean;
}

export default function DocumentUploader({ onUpload, existingName, encrypted = false }: DocumentUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState(existingName ? existingName : "");
  const [fileSize, setFileSize] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    if (file.size > 30 * 1024 * 1024) {
      setError("Documents must be 30MB or smaller");
      return;
    }
    if (!file.name.match(DOC_EXTS)) {
      setError("Unsupported file type. Use PDF, spreadsheet (xlsx/xls/csv/ods), Word (docx/doc), or text (txt/md).");
      return;
    }
    setFileName(file.name);
    setFileSize(formatSize(file.size));
    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("file", file);
      const data = await uploadJson(
        `${API}/upload${encrypted ? "?encrypted=1" : ""}`,
        fd,
        token ? { Authorization: `Bearer ${token}` } : {}
      );
      if (encrypted) {
        onUpload({ storageRef: data.storageRef, encryptedKey: data.encryptedKey, contentType: data.contentType, name: data.name, size: data.size });
      } else {
        onUpload({ url: data.url, name: data.name, size: data.size });
      }
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
        {uploading ? "Uploading document..." : "Drag & drop a document here, or click to select"}
      </div>
      <input
        ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.ods,.docx,.doc,.txt,.md"
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
