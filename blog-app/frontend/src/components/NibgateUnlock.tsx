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
  description?: string;
  imageUrl?: string;
  tags?: string[];
};

function GwOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{
        background: "var(--bg,#f4f4f0)", borderRadius: "16px",
        maxWidth: "540px", width: "100%", maxHeight: "90vh",
        overflow: "auto", position: "relative",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: "12px", right: "16px", zIndex: 20,
            background: "none", border: "none", fontSize: "28px",
            cursor: "pointer", color: "var(--muted,#6b6862)",
            fontFamily: "inherit", lineHeight: "1",
          }}
        >
          &times;
        </button>
        <GatewayWallet />
      </div>
    </div>
  );
}

export default function NibgateUnlock({ resource, children }: { resource: UnlockResource; children?: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ destroyed: false });
  const [showGw, setShowGw] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    stateRef.current.destroyed = false;

    const subdomain = (() => {
      const parts = window.location.hostname.split(".");
      if (parts.length >= 3 && parts[0] !== "www") return parts[0];
      return "";
    })();

    import("@nibgate/sdk").then((mod) => {
      if (stateRef.current.destroyed || !containerRef.current) return;
      const container = containerRef.current;
      container.innerHTML = "";
      (mod as any).renderDefaultUnlockUI(container, resource, {
        accessPath: `${API_BASE}/nibgate/access?path=${resource.path}&subdomain=${subdomain}`,
      });

      let addr = "";
      let gwEl: HTMLElement | null = null;
      let observer: MutationObserver | null = null;

      function ensureGwEl(label: HTMLElement): HTMLElement | null {
        const existing = container.querySelector<HTMLElement>("[data-gw-bal-inline]");
        if (existing) return existing;
        const el = document.createElement("span");
        el.dataset.gwBalInline = "";
        el.style.cssText = "margin-left:12px;font-size:18px;color:var(--accent,#7c9a6d);cursor:pointer;white-space:nowrap";
        el.addEventListener("click", () => setShowGw(true));
        label.appendChild(el);
        return el;
      }

      async function refresh() {
        if (stateRef.current.destroyed) return;
        if (!window.ethereum) return;
        try {
          const accounts: unknown = await window.ethereum.request({ method: "eth_accounts" });
          const a = Array.isArray(accounts) && accounts.length > 0 ? (accounts[0] as string) : null;
          if (!a) return;
          addr = a;

          const label = container.querySelector<HTMLElement>("[data-nibgate-wallet-label]");
          if (!label) return;

          if (!observer) {
            observer = new MutationObserver(() => {
              if (label.contains(gwEl)) return;
              gwEl = ensureGwEl(label);
            });
            observer.observe(label, { childList: true, subtree: true });
          }

          if (!gwEl || !label.contains(gwEl)) gwEl = ensureGwEl(label);
          if (!gwEl) return;

          const bal = await getGatewayBalance(addr);
          gwEl.textContent = "Gateway: " + bal;
        } catch {}
      }

      const iv = setInterval(refresh, 3000);
      setTimeout(refresh, 1000);
      if (window.ethereum) window.ethereum.on("accountsChanged", refresh);
    }).catch((err) => {
      console.error("Nibgate unlock failed to load:", err);
    });

    return () => {
      stateRef.current.destroyed = true;
    };
  }, [resource]);

  return (
    <>
      <div ref={containerRef} />
      <div data-nibgate-premium hidden>
        {children || <p>Content unlocked. Thank you for your support!</p>}
      </div>
      {showGw && <GwOverlay onClose={() => setShowGw(false)} />}
    </>
  );
}
