"use client";

import { useEffect, useRef, useState } from "react";

export default function DocxViewer({ src, onError }: { src: string; onError?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let buffer: ArrayBuffer;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        buffer = await res.arrayBuffer();
      } catch (e) {
        console.error("DocxViewer fetch failed:", e);
        if (!cancelled) {
          setLoading(false);
          setError(true);
          onErrorRef.current?.();
        }
        return;
      }
      try {
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !ref.current) return;
        if (ref.current.firstChild) ref.current.replaceChildren();
        await renderAsync(buffer, ref.current, undefined, { className: "docx" });
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error("DocxViewer failed:", e);
        if (!cancelled) {
          setLoading(false);
          setError(true);
          onErrorRef.current?.();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="doc-toolbar">
        <span className="doc-tool-spacer" />
        <a className="doc-tool-btn" href={src} download title="Download" aria-label="Download">Download</a>
      </div>
      <div className="doc-stage">
        <div ref={ref} style={{ display: error ? "none" : undefined }} />
      </div>
      {loading && !error && <div className="doc-viewer-loading">Loading document…</div>}
      {error && <div className="doc-viewer-error">Couldn&apos;t render this document inline — download the file to view it.</div>}
    </div>
  );
}
