"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import SheetViewer from "./SheetViewer";
import TextViewer from "./TextViewer";
import { detectEmbed, parseContent, type ContentFile } from "../lib/content";
import { fetchMediaObjectUrl } from "../lib/media";
import { SHEET_VIEWER_KINDS, TEXT_VIEWER_KINDS, kindFromName } from "../lib/documentKind";

type MediaRequest = { key: string; kind: string; index?: number };

function resolveEmbed(src: string | undefined, mediaUrls: Record<string, string>): string | undefined {
  if (!src) return undefined;
  const m = /^nibgate-embed:\/\/(\d+)$/.exec(src);
  return m ? mediaUrls[`embed-${m[1]}`] : src;
}

function requestsFor(content: ReturnType<typeof parseContent>): MediaRequest[] {
  if (!content) return [];
  if (content.kind === "markdown") {
    return content.media.flatMap((m, i) => (m.storageRef ? [{ key: `embed-${i}`, kind: "photo" as const, index: i }] : []));
  }
  if (content.kind === "photo") {
    return content.media.flatMap((m, i) => (m.storageRef ? [{ key: `photo-${i}`, kind: "photo" as const, index: i }] : []));
  }
  if (content.kind === "music" && content.audio?.storageRef) return [{ key: "audio", kind: "music" }];
  if (content.kind === "video" && content.file?.storageRef) return [{ key: "video", kind: "video" }];
  if (content.kind === "document" && content.doc?.storageRef) return [{ key: "document", kind: "document" }];
  return [];
}

export default function ContentViewer({ body, title, slug }: { body: unknown; title: string; slug: string }) {
  const [viewFailed, setViewFailed] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const content = useMemo(() => parseContent(body), [body]);
  const requests = useMemo(() => requestsFor(content), [content]);

  useEffect(() => {
    if (requests.length === 0) return;
    let cancelled = false;
    const urls: Record<string, string> = {};
    (async () => {
      await Promise.all(
        requests.map(async (r) => {
          try {
            const u = await fetchMediaObjectUrl(slug, r.kind, r.index);
            if (!cancelled) urls[r.key] = u;
          } catch (err) {
            console.error("Media load failed:", err);
          }
        }),
      );
      if (!cancelled) setMediaUrls(urls);
    })();
    return () => {
      cancelled = true;
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
      setMediaUrls({});
    };
  }, [slug, requests]);

  if (!content) return null;

  if (content.kind === "markdown") {
    return (
      <div className="prose prose-neutral dark:prose-invert">
        <ReactMarkdown
          components={{
            img: ({ src, alt }) => {
              const resolved = resolveEmbed(typeof src === "string" ? src : undefined, mediaUrls);
              return resolved ? <img src={resolved} alt={alt || ""} style={{ maxWidth: "100%", borderRadius: "6px" }} /> : null;
            },
            a: ({ href, children }) => {
              const resolved = resolveEmbed(typeof href === "string" ? href : undefined, mediaUrls);
              return resolved ? <a href={resolved} target="_blank" rel="noopener noreferrer">{children}</a> : <a href={href}>{children}</a>;
            },
          }}
        >
          {content.markdown || ""}
        </ReactMarkdown>
      </div>
    );
  }

  if (content.kind === "photo") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {content.media.map((item, i) => {
          const src = item.url || mediaUrls[`photo-${i}`];
          if (!src) return null;
          return (
            <div key={i}>
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img src={src} alt={item.caption || `${title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px", border: "1px solid var(--border)" }} loading="lazy" />
              </a>
              {item.caption && <p className="small muted" style={{ marginTop: "0.3em" }}>{item.caption}</p>}
            </div>
          );
        })}
        {content.media.length === 0 && content.caption && <p className="small muted">{content.caption}</p>}
      </div>
    );
  }

  if (content.kind === "music") {
    const src = content.audio?.url || mediaUrls.audio;
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        {content.coverUrl && (
          <img src={content.coverUrl} alt={content.caption || title} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px", marginBottom: "1rem", maxHeight: "400px", objectFit: "cover" }} />
        )}
        {src && <audio controls src={src} style={{ width: "100%" }} />}
        {content.caption && <p className="small muted" style={{ marginTop: "0.5em" }}>{content.caption}</p>}
      </div>
    );
  }

  if (content.kind === "video") {
    const embed = content.videoUrl ? detectEmbed(content.videoUrl) : null;
    const fileSrc = content.file?.url || mediaUrls.video;
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        {embed?.type === "youtube" ? (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px" }}>
            <iframe
              src={embed.embedUrl || content.videoUrl || undefined}
              title={content.caption || title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        ) : fileSrc ? (
          <video controls src={fileSrc} style={{ width: "100%", borderRadius: "6px", display: "block", background: "#000" }} playsInline />
        ) : content.videoUrl ? (
          <a href={content.videoUrl} target="_blank" rel="noopener noreferrer" className="btn-primary no-underline" style={{ fontSize: "14px", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
            Watch video
          </a>
        ) : null}
        {content.caption && <p className="small muted" style={{ marginTop: "0.5em" }}>{content.caption}</p>}
      </div>
    );
  }

  const doc: ContentFile | null = content.doc;
  const kind = kindFromName(doc?.name || "");
  const isSheet = kind !== null && SHEET_VIEWER_KINDS.has(kind) && !!doc?.url && !viewFailed;
  const isText = kind !== null && TEXT_VIEWER_KINDS.has(kind) && !!doc?.url && !viewFailed;
  const isPdf = kind === "pdf";
  const docSrc = doc?.url || mediaUrls.document;
  const showFrame = isPdf && !!docSrc && !viewFailed;
  const canPreview = isSheet || isText || showFrame;

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {content.coverUrl && (
        <img src={content.coverUrl} alt={content.caption || title} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px", marginBottom: "1rem", maxHeight: "400px", objectFit: "cover" }} />
      )}
      {isSheet && docSrc && (
        <div className="doc-viewer doc-viewer--sheet" style={{ marginBottom: "1.5rem" }}>
          <SheetViewer src={docSrc} onError={() => setViewFailed(true)} />
        </div>
      )}
      {isText && docSrc && (
        <div className="doc-viewer doc-viewer--app" style={{ marginBottom: "1.5rem" }}>
          <TextViewer src={docSrc} kind={kind || "text"} onError={() => setViewFailed(true)} />
        </div>
      )}
      {showFrame && docSrc && (
        <iframe src={docSrc} title={doc?.name || title} style={{ width: "100%", height: "75vh", border: "1px solid var(--border)", borderRadius: "8px", background: "#fff", marginBottom: "1rem" }} />
      )}
      {!viewFailed && !canPreview && doc?.name && docSrc && (
        <p className="small muted" style={{ marginBottom: "1rem" }}>{doc.name}{doc.size ? ` · ${(Number(doc.size) / 1048576).toFixed(1)} MB` : ""}</p>
      )}
      {docSrc && (
        <div>
          <a href={docSrc} download={doc?.name || "document"} target="_blank" rel="noopener noreferrer" className="btn-primary no-underline" style={{ fontSize: "14px", padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download {doc?.name || "file"}
          </a>
        </div>
      )}
      {content.caption && <p className="small muted" style={{ marginTop: "0.5em" }}>{content.caption}</p>}
    </div>
  );
}
