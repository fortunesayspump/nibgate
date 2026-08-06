"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.6;

export default function TextViewer({ src, kind, onError }: { src: string; kind: string; onError?: () => void }) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const isMarkdown = kind === "markdown";

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (!cancelled) {
          setText(t);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("TextViewer failed:", e);
        if (!cancelled) {
          setLoading(false);
          setError(true);
          onErrorRef.current?.();
        }
      });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {!error && (
        <div className="doc-toolbar">
          <button type="button" className="doc-tool-btn" onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s / 1.1).toFixed(2)))} disabled={scale <= MIN_SCALE} title="Decrease text size" aria-label="Decrease text size">A−</button>
          <span className="doc-tool-label">{Math.round(scale * 100)}%</span>
          <button type="button" className="doc-tool-btn" onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s * 1.1).toFixed(2)))} disabled={scale >= MAX_SCALE} title="Increase text size" aria-label="Increase text size">A+</button>
          <span className="doc-tool-spacer" />
          <a className="doc-tool-btn" href={src} download title="Download" aria-label="Download">Download</a>
        </div>
      )}
      <div className="doc-stage">
        <div className="doc-page" style={{ fontSize: `${Math.round(15 * scale)}px` }}>
          {isMarkdown ? (
            <div className="doc-markdown">
              <ReactMarkdown>{text || ""}</ReactMarkdown>
            </div>
          ) : (
            <pre className="doc-text">{text}</pre>
          )}
        </div>
      </div>
      {loading && !error && <div className="doc-viewer-loading">Loading document…</div>}
      {error && <div className="doc-viewer-error">Couldn&apos;t render this document inline — download the file to view it.</div>}
    </div>
  );
}
