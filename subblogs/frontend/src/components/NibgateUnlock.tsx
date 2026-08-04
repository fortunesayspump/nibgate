"use client";

import { useEffect, useRef, useState } from "react";
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
  }

  function applyUnlock(data: any, proof: string) {
    if (data?.content !== undefined && data?.content !== null) setContent(data.content);
    if (data?.videoUrl) setVideoUrl(data.videoUrl);
    if (data?.media) {
      if (proof && (data.media.hasAudio || data.media.photos > 0)) loadMedia(proof, data.media);
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

  if (unlocked) {
    return (
      <>
        {audioUrl && (
          <div style={{ marginBottom: "1.5rem" }}>
            <audio controls src={audioUrl} style={{ width: "100%" }} />
          </div>
        )}
        {photoUrls.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`${resource.title} ${i + 1}`} style={{ width: "100%", height: "auto", display: "block", borderRadius: "6px", border: "1px solid var(--border)" }} loading="lazy" />
              </a>
            ))}
          </div>
        )}
        {videoUrl && (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: "6px", marginBottom: "1.5rem" }}>
            <iframe src={(() => { const e = detectEmbed(videoUrl); return e.type === "youtube" && e.embedUrl ? e.embedUrl : videoUrl; })()} title={resource.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
          </div>
        )}
        {content !== null && content !== "" && (
          <div className="prose prose-neutral dark:prose-invert" dangerouslySetInnerHTML={{ __html: content }} />
        )}
      </>
    );
  }

  return <div ref={containerRef} />;
}
