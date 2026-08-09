"use client";

import { useEffect, useRef, useState } from "react";
import ContentViewer from "./ContentViewer";
import { ACCESS_PATH, GATEWAY_BALANCE_PATH } from "../api";
import type { AccessResource } from "../types";

type UnlockResult = { payload?: { content?: unknown } };

export default function UnlockGate({ resource }: { resource: AccessResource }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ destroyed: false });
  const [unlocked, setUnlocked] = useState(false);
  const [body, setBody] = useState<unknown>(null);

  const accessPath = ACCESS_PATH(resource.id);

  function applyUnlock(data?: { content?: unknown }) {
    if (data?.content !== undefined && data?.content !== null) setBody(data.content);
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
      }).then(r => r.json()).then((data) => {
        if (!stateRef.current.destroyed) {
          if (data?.ok) applyUnlock(data);
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
        if (!containerRef.current || stateRef.current.destroyed) return;
        (mod as any).renderDefaultUnlockUI(container, resource, {
          accessPath,
          gatewayBalanceUrl: GATEWAY_BALANCE_PATH,
          onUnlock: (result: UnlockResult) => {
            if (stateRef.current.destroyed) return;
            applyUnlock(result?.payload);
          },
        });
      }).catch((err) => console.error("SDK load failed:", err));
    }

    return () => { stateRef.current.destroyed = true; };
  }, [resource.id]);

  if (unlocked) {
    return <ContentViewer body={body} title={resource.title} slug={resource.id} />;
  }

  return <div ref={containerRef} />;
}
