"use client";

import { useEffect, useRef, useState } from "react";
import { getGatewayBalance } from "@/lib/gateway-core";
import GatewayWallet from "./GatewayWallet";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type UnlockResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

function GwOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div ref={ref} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "var(--bg,#f4f4f0)", borderRadius: "16px", maxWidth: "540px", width: "100%", maxHeight: "90vh", overflow: "auto", position: "relative", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "12px", right: "16px", zIndex: 20, background: "none", border: "none", fontSize: "28px", cursor: "pointer", color: "var(--muted,#6b6862)", fontFamily: "inherit", lineHeight: "1" }}>&times;</button>
        <GatewayWallet />
      </div>
    </div>
  );
}

export default function NibgateUnlock({ resource }: { resource: UnlockResource }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ destroyed: false });
  const [content, setContent] = useState<string | null>(null);
  const [showGw, setShowGw] = useState(false);

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

        // Gateway balance — shown after wallet connects
        let addr = "";
        let gwEl: HTMLElement | null = null;
        let observer: MutationObserver | null = null;

        function ensureBalEl(label: HTMLElement) {
          let el = container.querySelector<HTMLElement>("[data-gw-bal]");
          if (el) return el;
          el = document.createElement("span");
          el.dataset.gwBal = "";
          el.style.cssText = "margin-left:12px;font-size:18px;color:var(--accent,#7c9a6d);cursor:pointer;white-space:nowrap";
          el.innerHTML = "💰 <span data-gw-bal-text></span>";
          el.title = "Gateway balance — click to deposit/withdraw";
          el.addEventListener("click", () => setShowGw(true));
          label.appendChild(el);
          return el;
        }

        async function refreshBal() {
          if (stateRef.current.destroyed) return;
          if (!window.ethereum) return;
          try {
            const accounts: unknown = await (window as any).ethereum.request({ method: "eth_accounts" });
            const a = Array.isArray(accounts) && accounts.length > 0 ? (accounts[0] as string) : null;
            if (!a) return;
            addr = a;
            const label = container.querySelector<HTMLElement>("[data-nibgate-wallet-label]");
            if (!label) return;
            if (!observer) {
              observer = new MutationObserver(() => { if (!label.contains(gwEl)) gwEl = ensureBalEl(label); });
              observer.observe(label, { childList: true, subtree: true });
            }
            if (!gwEl || !label.contains(gwEl)) gwEl = ensureBalEl(label);
            if (!gwEl) return;
            const txt = gwEl.querySelector("[data-gw-bal-text]");
            if (txt) txt.textContent = await getGatewayBalance(addr);
          } catch {}
        }

        const iv = setInterval(refreshBal, 3000);
        setTimeout(refreshBal, 1000);
        if (window.ethereum) (window as any).ethereum.on("accountsChanged", refreshBal);
      }).catch(() => {});
    }

    return () => { stateRef.current.destroyed = true; };
  }, [resource.id]);

  if (content !== null) {
    return <div className="prose prose-neutral dark:prose-invert" dangerouslySetInnerHTML={{ __html: content }} />;
  }

  return (
    <>
      <div ref={containerRef} />
      {showGw && <GwOverlay onClose={() => setShowGw(false)} />}
    </>
  );
}
