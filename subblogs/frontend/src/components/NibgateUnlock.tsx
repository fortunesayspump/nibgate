"use client";

import { useEffect, useRef, useState } from "react";

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
  const [content, setContent] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

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
          if (data?.content) setContent(data.content);
          if (data?.videoUrl) setVideoUrl(data.videoUrl);
          if (!data?.content && !inited) { inited = true; loadUI(); }
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
            const c = result?.payload?.content || "";
            if (c) setContent(c);
            const v = result?.payload?.videoUrl || result?.videoUrl || "";
            if (v) setVideoUrl(v);
          },
        });
      }).catch((err) => console.error("SDK load failed:", err));
    }

    return () => { stateRef.current.destroyed = true; };
  }, [resource.id]);

  if (content !== null) {
    return (
      <>
        {videoUrl && (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px", marginBottom: "1.5rem" }}>
            <iframe src={(() => { const e = detectEmbed(videoUrl); return e.type === "youtube" && e.embedUrl ? e.embedUrl : videoUrl; })()} title={resource.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
          </div>
        )}
        <div className="prose prose-neutral dark:prose-invert" dangerouslySetInnerHTML={{ __html: content }} />
      </>
    );
  }

  return <div ref={containerRef} />;
}
