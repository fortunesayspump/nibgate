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

  const subdomain = (() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.hostname.split(".");
    if (parts.length >= 3 && parts[0] !== "www") return parts[0];
    return "";
  })();

  const accessPath = `${API_BASE}/nibgate/access?path=${resource.path}&subdomain=${subdomain}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    stateRef.current.destroyed = false;

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
          else loadUnlockUI();
        }
      }).catch(() => { if (!stateRef.current.destroyed) loadUnlockUI(); });
    } else {
      loadUnlockUI();
    }

    function loadUnlockUI() {
      if (stateRef.current.destroyed || !containerRef.current) return;
      const container = containerRef.current;
      container.innerHTML = "";
      import("@nibgate/sdk").then((mod) => {
        if (stateRef.current.destroyed || !containerRef.current) return;
        (mod as any).renderDefaultUnlockUI(container, resource, {
          accessPath,
          onUnlock: (result: any) => {
            const c = result?.payload?.content || "";
            if (c) setContent(c);
          },
        });
      }).catch(() => {});
    }

    return () => { stateRef.current.destroyed = true; };
  }, [resource.id]);

  if (content !== null) {
    return <div className="prose prose-neutral dark:prose-invert" dangerouslySetInnerHTML={{ __html: content }} />;
  }

  return <div ref={containerRef} />;
}
