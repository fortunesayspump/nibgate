"use client";

import { useEffect, useState } from "react";
import NibgateUnlock from "@/components/NibgateUnlock";
import SheetViewer from "@/components/SheetViewer";
import TextViewer from "@/components/TextViewer";
import { KIND_LABELS, SHEET_KINDS, SHEET_VIEWER_KINDS, TEXT_VIEWER_KINDS, kindFromName } from "@/lib/documentKind";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const API_ORIGIN = API.replace(/\/+$/, "").replace(/\/api$/, "");

type UnlockResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

type DocumentContentProps = {
  postId: string;
  title: string;
  name: string | null;
  size: number | null;
  contentType: string | null;
  documentUrl: string | null;
  isPaid: boolean;
  resource: UnlockResource;
};

function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url}`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIconPalette(kind: string | null) {
  const k = kind || "";
  if (k === "pdf") return { bg: "#fdeceb", fg: "#e25041" };
  if (k.startsWith("legacy")) return { bg: "#ececea", fg: "#6b6862" };
  if (SHEET_KINDS.has(k)) return { bg: "#e6f4ea", fg: "#188038" };
  return { bg: "#e8f0fe", fg: "#1a73e8" };
}

function FileTypeIcon({ kind, size = 24 }: { kind: string | null; size?: number }) {
  const p = fileIconPalette(kind);
  const isSheet = SHEET_KINDS.has(kind || "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill={p.bg} stroke={p.fg} strokeWidth="1.4" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" fill="none" stroke={p.fg} strokeWidth="1.4" strokeLinejoin="round" />
      {isSheet ? (
        <g stroke={p.fg} strokeWidth="1.2">
          <rect x="8" y="12.5" width="8" height="6.5" rx="0.6" fill="none" />
          <path d="M10.7 12.5v6.5 M13.3 12.5v6.5 M8 15.2h8 M8 17.8h8" />
        </g>
      ) : (
        <g stroke={p.fg} strokeWidth="1.2" strokeLinecap="round">
          <line x1="8" y1="12.5" x2="16" y2="12.5" />
          <line x1="8" y1="15.5" x2="16" y2="15.5" />
          <line x1="8" y1="18.5" x2="13.5" y2="18.5" />
        </g>
      )}
    </svg>
  );
}

export default function DocumentContent({ postId, title, name, size, contentType, documentUrl, isPaid, resource }: DocumentContentProps) {
  const [preview, setPreview] = useState<{ kind: string | null; html: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [appFailed, setAppFailed] = useState(false);

  const subdomain = (() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.hostname.split(".");
    if (parts.length >= 3 && parts[0] !== "www") return parts[0];
    return "";
  })();

  useEffect(() => {
    if (isPaid) { setLoading(false); return; }
    let cancelled = false;
    fetch(`${API}/nibgate/media/${postId}/document/preview?subdomain=${subdomain}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setPreview({ kind: data.kind || null, html: data.html || null });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postId]);

  const kind = preview?.kind || kindFromName(name) || null;
  const isPdf = contentType === "application/pdf" || kind === "pdf";
  const hasRender = !!preview?.html;
  const isSheet = kind !== null && SHEET_VIEWER_KINDS.has(kind);
  const isText = kind !== null && TEXT_VIEWER_KINDS.has(kind);
  const showApp = (isSheet || isText) && !appFailed;
  const showHtml = hasRender && !showApp;
  const showPdfFrame = isPdf && !showApp && !hasRender;
  const showUnavailable = !showApp && !hasRender && !showPdfFrame && kind !== null && (kind.startsWith("legacy") || kind === "pptx");
  const mediaSrc = `${API}/nibgate/media/${postId}/document?subdomain=${subdomain}`;
  const downloadHref = isPaid ? null : `${API}/nibgate/media/${postId}/document?download=1&subdomain=${subdomain}`;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
        border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)",
        marginBottom: showApp || hasRender || showPdfFrame ? "1rem" : 0,
      }}>
        <span className="file-type-badge" title={KIND_LABELS[kind || ""] || "File"} aria-label={KIND_LABELS[kind || ""] || "File"}>
          <FileTypeIcon kind={kind} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name || title}
          </div>
          <div className="small muted">{formatSize(size)}</div>
        </div>
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          {downloadHref && !isPaid && (
            <a href={downloadHref} download={name || undefined} className="btn-icon" title="Download" aria-label="Download">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {loading && <p className="small muted">Loading preview…</p>}

      {showApp && (
        <div className={`doc-viewer ${isSheet ? "doc-viewer--sheet" : "doc-viewer--app"}`}>
          {isSheet ? (
            <SheetViewer src={mediaSrc} onError={() => setAppFailed(true)} />
          ) : (
            <TextViewer src={mediaSrc} kind={kind || "text"} onError={() => setAppFailed(true)} />
          )}
        </div>
      )}

      {showHtml && (
        <div className="doc-viewer">
          <div className="doc-stage">
            <div className="doc-page" dangerouslySetInnerHTML={{ __html: preview.html! }} />
          </div>
        </div>
      )}

      {showPdfFrame && (
        <iframe
          src={absoluteUrl(documentUrl || "") || mediaSrc}
          title={title}
          className="doc-pdf"
        />
      )}

      {showUnavailable && (
        <div className="doc-unavailable">
          This format doesn&apos;t support inline preview — download the file to view it.
        </div>
      )}

      {isPaid && (
        <div style={{ marginTop: "1rem" }}>
          <NibgateUnlock resource={resource} />
        </div>
      )}
    </div>
  );
}
