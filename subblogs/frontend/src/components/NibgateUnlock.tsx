"use client";

import { useEffect, useRef, useState } from "react";
import SheetViewer from "@/components/SheetViewer";
import TextViewer from "@/components/TextViewer";
import { UNIVERSAL_KINDS, SHEET_VIEWER_KINDS, TEXT_VIEWER_KINDS, kindFromMeta } from "@/lib/documentKind";
import type { UnlockMediaMeta } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type UnlockResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

export default function NibgateUnlock({ resource }: { resource: UnlockResource }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ destroyed: false });
  const [unlocked, setUnlocked] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [documentContentType, setDocumentContentType] = useState<string | null>(null);
  const [viewFailed, setViewFailed] = useState(false);
  const proofRef = useRef("");

  function detectEmbed(url: string) {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    if (yt) return { type: "youtube" as const, videoId: yt[1], embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
    return { type: "unknown" as const, embedUrl: null };
  }

  const subdomain = (() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.hostname.split(".");
    if (parts.length >= 3 && parts[0] !== "www") return parts[0];
    return "";
  })();

  const accessPath = `${API_BASE}/nibgate/access?path=${resource.path}&subdomain=${subdomain}`;

  async function loadMedia(proof: string, meta: UnlockMediaMeta) {
    if (meta.hasAudio) {
      try {
        const res = await fetch(`${API_BASE}/nibgate/media/${resource.id}/audio?subdomain=${subdomain}`, {
          headers: { "x-nibgate-payment-proof": proof },
        });
        if (res.ok) setAudioUrl(URL.createObjectURL(await res.blob()));
      } catch {}
    }
    if (meta.photos > 0) {
      const urls: string[] = [];
      for (let i = 0; i < meta.photos; i++) {
        try {
          const res = await fetch(`${API_BASE}/nibgate/media/${resource.id}/photo?index=${i}&subdomain=${subdomain}`, {
            headers: { "x-nibgate-payment-proof": proof },
          });
          if (res.ok) urls.push(URL.createObjectURL(await res.blob()));
        } catch {}
      }
      setPhotoUrls(urls);
    }
    if (meta.hasVideo) {
      try {
        const res = await fetch(`${API_BASE}/nibgate/media/${resource.id}/video?subdomain=${subdomain}`, {
          headers: { "x-nibgate-payment-proof": proof },
        });
        if (res.ok) setVideoUrl(URL.createObjectURL(await res.blob()));
      } catch {}
    }
    if (meta.hasDocument) {
      const kind = kindFromMeta(meta.documentName, meta.documentContentType);
      const universal = kind !== null && UNIVERSAL_KINDS.has(kind);
      try {
        const res = await fetch(`${API_BASE}/nibgate/media/${resource.id}/document?inline=1&subdomain=${subdomain}`, {
          headers: { "x-nibgate-payment-proof": proof },
        });
        if (res.ok) setDocumentUrl(URL.createObjectURL(await res.blob()));
      } catch {}
      if (!universal) {
        try {
          const res = await fetch(`${API_BASE}/nibgate/media/${resource.id}/document/render?subdomain=${subdomain}`, {
            headers: { "x-nibgate-payment-proof": proof },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.html) setDocHtml(data.html);
          }
        } catch {}
      }
    }
  }

  function applyUnlock(data: any, proof: string) {
    if (proof) proofRef.current = proof;
    if (data?.content !== undefined && data?.content !== null) setContent(data.content);
    if (data?.videoUrl) setVideoUrl(data.videoUrl);
    if (data?.media) {
      if (proof && (data.media.hasAudio || data.media.photos > 0 || data.media.hasVideo || data.media.hasDocument)) loadMedia(proof, data.media);
      if (data.media.documentName) setDocumentName(data.media.documentName);
      if (data.media.documentContentType) setDocumentContentType(data.media.documentContentType);
    }
    setUnlocked(true);
  }

  useEffect(() => {
    if (!containerRef.current) return;
    stateRef.current.destroyed = false;
    let inited = false;

    const storedProof = (() => {
      try { return localStorage.getItem(`nibgate:payment-proof:${resource.id}`) || ""; }
      catch { return ""; }
    })();

    if (storedProof) {
      fetch(accessPath, {
        headers: { accept: "application/json", "x-nibgate-payment-proof": storedProof },
      }).then(r => r.json()).then(data => {
        if (!stateRef.current.destroyed) {
          if (data?.ok) applyUnlock(data, storedProof);
          else if (!inited) { inited = true; loadUI(); }
        }
      }).catch(() => { if (!stateRef.current.destroyed && !inited) { inited = true; loadUI(); } });
    } else if (!inited) {
      inited = true;
      loadUI();
    }

    function loadUI() {
      if (!containerRef.current) return;
      const container = containerRef.current;
      container.innerHTML = "";
      import("@nibgate/sdk").then((mod) => {
        if (!containerRef.current) return;
        (mod as any).renderDefaultUnlockUI(container, resource, {
          accessPath,
          gatewayBalanceUrl: `${API_BASE}/nibgate/gateway/balance`,
          onUnlock: (result: any) => {
            const proof = result?.payload?.unlockProof || storedProof || "";
            applyUnlock(result?.payload, proof);
          },
        });
      }).catch((err) => console.error("SDK load failed:", err));
    }

    return () => { stateRef.current.destroyed = true; };
  }, [resource.id]);

  async function onViewerFailed() {
    setViewFailed(true);
    try {
      const res = await fetch(`${API_BASE}/nibgate/media/${resource.id}/document/render?subdomain=${subdomain}`, {
        headers: { "x-nibgate-payment-proof": proofRef.current },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.html) setDocHtml(data.html);
      }
    } catch {}
  }

  if (unlocked) {
    const kind = kindFromMeta(documentName, documentContentType);
    const isSheet = (kind !== null && SHEET_VIEWER_KINDS.has(kind)) && !!documentUrl && !viewFailed;
    const isText = (kind !== null && TEXT_VIEWER_KINDS.has(kind)) && !!documentUrl && !viewFailed;
    const showPdfFrame = kind === "pdf" && !!documentUrl && !isSheet && !isText && !docHtml;
    const showHtml = !!docHtml && !isSheet && !isText;
    const contentHtml = (content || "").replace(/!\[([^\]]*)\]\(nibgate-embed:\/\/(\d+)\)/g, (m, alt, idx) => photoUrls[parseInt(idx, 10)] ? `<img src="${photoUrls[parseInt(idx, 10)]}" alt="${alt}" style="max-width:100%;border-radius:6px" />` : m).replace(/\[([^\]]*)\]\(nibgate-embed:\/\/(\d+)\)/g, (m, label, idx) => photoUrls[parseInt(idx, 10)] ? `<a href="${photoUrls[parseInt(idx, 10)]}" target="_blank" rel="noopener noreferrer">${label}</a>` : m);
    return (
      <>
        {audioUrl && (
          <div style={{ marginBottom: "1.5rem" }}>
            <audio controls src={audioUrl} style={{ width: "100%" }} />
          </div>
        )}
        {photoUrls.length > 0 && resource.type === "photo" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`${resource.title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px", border: "1px solid var(--border)" }} loading="lazy" />
              </a>
            ))}
          </div>
        )}
        {(isSheet || isText) && (
          <div className={`doc-viewer ${isSheet ? "doc-viewer--sheet" : "doc-viewer--app"}`} style={{ marginBottom: "1.5rem" }}>
            {isSheet ? (
              <SheetViewer src={documentUrl!} onError={onViewerFailed} />
            ) : (
              <TextViewer src={documentUrl!} kind={kind || "text"} onError={onViewerFailed} />
            )}
          </div>
        )}
        {showHtml && (
          <div className="doc-viewer" style={{ marginBottom: "1.5rem" }}>
            <div className="doc-stage">
              <div className="doc-page" dangerouslySetInnerHTML={{ __html: docHtml }} />
            </div>
          </div>
        )}
        {showPdfFrame && (
          <iframe src={documentUrl} title={resource.title} style={{ width: "100%", height: "75vh", border: "1px solid var(--border)", borderRadius: "8px", background: "#fff", marginBottom: "1.5rem" }} />
        )}
        {documentUrl && (
          <div style={{ marginBottom: "1.5rem" }}>
            <a href={documentUrl} download={documentName || "document"} className="btn-primary" style={{ fontSize: "14px", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download {documentName || "file"}
            </a>
          </div>
        )}
        {videoUrl && (() => {
          const embed = detectEmbed(videoUrl);
          if (embed.type === "youtube") {
            return (
              <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px", marginBottom: "1.5rem" }}>
                <iframe src={embed.embedUrl || videoUrl} title={resource.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
              </div>
            );
          }
          return (
            <video controls src={videoUrl} style={{ width: "100%", borderRadius: "6px", display: "block", background: "#000", marginBottom: "1.5rem" }} playsInline />
          );
        })()}
        {content !== null && content !== "" && (
          <div className="prose prose-neutral dark:prose-invert" dangerouslySetInnerHTML={{ __html: contentHtml }} />
        )}
      </>
    );
  }

  return <div ref={containerRef} />;
}
