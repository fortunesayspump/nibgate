"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FiX, FiCheck, FiLink, FiRefreshCw, FiTrash2, FiAlertTriangle } from "react-icons/fi";
import { nibshareApi } from "../../api";
import { TypeBadge, StatusBadge, ActiveBadge } from "./StatusBadges";
import { StatCard } from "./StatCard";
import { shortAddress, formatUsd, isEnded, endLabel } from "../../lib/shares";
import type { ShareSummary } from "../../types";

export function SettingsSheet({ share, onClose, onRotate, onRevoke }: {
  share: ShareSummary;
  onClose: () => void;
  onRotate: (oldSlug: string, newSlug: string, url: string) => void;
  onRevoke: (slug: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [current, setCurrent] = useState(share);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const revenue = current.receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const paid = Number(current.price) > 0;
  const revoked = current.status === "revoked";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(current.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy link:", current.url);
    }
  }

  async function handleRotate() {
    if (!confirm("Generate a new link? The current link will stop working.")) return;
    setBusy(true);
    try {
      const data = await nibshareApi.reslug(current.slug);
      setCurrent((c) => ({ ...c, slug: data.slug, url: data.url }));
      onRotate(current.slug, data.slug, data.url);
    } catch (err: any) {
      alert(err.message || 'Failed to rotate link');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!confirm(`Revoke "${current.title}"? Unlocks stop and the link goes dead.`)) return;
    setBusy(true);
    try {
      await nibshareApi.revoke(current.slug);
      onRevoke(current.slug);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke');
      setBusy(false);
    }
  }

  const actionBtn = {
    width: '100%',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--fg)',
    borderRadius: '8px',
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
  } as const;

  const primaryBtn = { ...actionBtn, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff' } as const;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div
        className="nibshare-root"
        style={{ width: "100%", maxWidth: "480px", maxHeight: "80vh", overflowY: "auto", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--bg)", padding: "20px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm font-semibold truncate">{current.title}</h2>
              <TypeBadge type={current.contentType} />
              {current.status === "draft" ? <StatusBadge label="draft" /> : isEnded(current) ? <StatusBadge label={endLabel(current)} /> : <ActiveBadge share={current} />}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Created {new Date(current.createdAt).toLocaleDateString()} · <Link href={`/ns/${current.slug}`} className="no-underline" style={{ color: "var(--accent)" }}>View post ↗</Link>
            </p>
          </div>
          <button onClick={onClose} className="inline-flex items-center justify-center w-7 h-7 rounded-md border shrink-0" style={{ borderColor: "var(--border)", color: "var(--muted)" }} title="Close">
            <FiX size={15} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button style={primaryBtn} onClick={handleCopy} disabled={busy}>
            {copied ? <FiCheck size={14} /> : <FiLink size={14} />} {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button style={actionBtn} onClick={handleRotate} disabled={busy || revoked} title={revoked ? 'Revoked shares cannot be re-linked' : undefined}>
            <FiRefreshCw size={14} /> New link
          </button>
        </div>
        {copied && (
          <p className="text-[10px] truncate mb-3" style={{ color: "#7c9a6d" }}>
            <FiCheck size={11} className="inline mr-1" />{current.url}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <StatCard label="Unlocks" value={String(current.unlockCount)} />
          <StatCard label="Views" value={String(current.viewCount ?? 0)} />
          <StatCard label="Revenue" value={`${formatUsd(revenue)} USDC`} accent={revenue > 0 ? "#7c9a6d" : undefined} />
          <StatCard label="Price" value={paid ? `${formatUsd(Number(current.price))} USDC` : "Free"} />
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Receipts</span>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>{current.receipts.length} total</span>
        </div>
        {current.receipts.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--muted)" }}>No unlocks yet.</p>
        ) : (
          <div className="flex flex-col">
            {current.receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{shortAddress(r.payerWallet)}</p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                    {new Date(r.unlockedAt).toLocaleString()}{r.txHash ? ` · ${shortAddress(r.txHash)}` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold shrink-0" style={{ color: Number(r.amount) > 0 ? "#7c9a6d" : "var(--muted)" }}>
                  {Number(r.amount) > 0 ? `${formatUsd(Number(r.amount))} USDC` : "Free"}
                </span>
              </div>
            ))}
          </div>
        )}

        {!revoked && (
          <div className="rounded-md border p-3 mt-4" style={{ borderColor: "#c4455580" }}>
            <p className="text-[10px] uppercase tracking-wide font-semibold mb-2 flex items-center gap-1" style={{ color: "#c44" }}>
              <FiAlertTriangle size={11} /> Danger zone
            </p>
            <button style={{ ...actionBtn, color: "#c44", borderColor: "#c448" }} onClick={handleRevoke} disabled={busy}>
              <FiTrash2 size={14} /> Revoke post
            </button>
            <p className="text-[10px] mt-1.5" style={{ color: "var(--muted)" }}>Unlocks stop and the link goes dead immediately.</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
