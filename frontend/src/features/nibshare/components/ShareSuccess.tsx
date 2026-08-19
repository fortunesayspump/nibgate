"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FiCheck, FiCopy, FiLink, FiX } from "react-icons/fi";
import { timeLeft } from "../lib/shares";

export function ShareSuccess({ slug, url, title, price, expiresAt, onDone, saved = false }: {
  slug: string;
  url: string;
  title: string;
  price: string;
  expiresAt: string | null;
  onDone: () => void;
  saved?: boolean;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [copied, setCopied] = useState(false);
  const left = timeLeft(expiresAt);
  const paid = Number(price) > 0;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy link:", url);
    }
  }

  const actionBtn = {
    width: "100%",
    justifyContent: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: 600,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    borderRadius: "8px",
    padding: "10px 12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  } as const;

  const primaryBtn = { ...actionBtn, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff" } as const;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div
        className="nibshare-root"
        style={{ width: "100%", maxWidth: "440px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--bg)", padding: "20px" }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0" style={{ background: "#7c9a6d20", color: "#7c9a6d" }}>
              <FiCheck size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{saved ? "Saved!" : "Published!"}</h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>{title}</p>
            </div>
          </div>
          <button onClick={onDone} className="inline-flex items-center justify-center w-7 h-7 rounded-md border shrink-0" style={{ borderColor: "var(--border)", color: "var(--muted)" }} title="Close">
            <FiX size={15} />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-md border p-2 pl-3 mb-3" style={{ borderColor: "var(--border)" }}>
          <FiLink size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
          <span className="text-xs font-mono truncate flex-1" style={{ color: "var(--muted)" }}>{url}</span>
          <button onClick={handleCopy} style={{ ...actionBtn, width: "auto", padding: "6px 12px" }} title="Copy link">
            {copied ? <FiCheck size={13} style={{ color: "#7c9a6d" }} /> : <FiCopy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          {paid ? `${price} USDC to unlock` : "Free to unlock"} · {left ? `auto-expires in ${left}` : "no expiry"}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Link href={`/ns/${slug}`} className="no-underline" style={primaryBtn}>
            View post
          </Link>
          <button style={actionBtn} onClick={onDone}>Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
