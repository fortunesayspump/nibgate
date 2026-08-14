"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FiX, FiCheck, FiLink, FiRefreshCw, FiTrash2, FiAlertTriangle, FiLock, FiEye, FiUserX, FiUserCheck, FiRotateCcw, FiUsers } from "react-icons/fi";
import { nibshareApi } from "../../api";
import { WalletListEditor } from "../WalletListEditor";
import { TypeBadge, StatusBadge, ActiveBadge } from "./StatusBadges";
import { StatCard } from "./StatCard";
import { shortAddress, formatUsd, isEnded, endLabel } from "../../lib/shares";
import type { AccessControl, EntitlementRecord, ShareSummary } from "../../types";

const fmtAddr = (w: string) => shortAddress(w.toLowerCase());

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
  const [busyWallets, setBusyWallets] = useState<Set<string>>(new Set());
  const [ac, setAc] = useState<AccessControl | null>(null);
  const [acLoading, setAcLoading] = useState(true);
  const [wlPriceInput, setWlPriceInput] = useState("");
  const [tierMode, setTierMode] = useState<"__public" | "0" | "__custom">("__public");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await nibshareApi.accessControl(current.slug);
        if (!cancelled) {
          setAc(data);
          setWlPriceInput(data.whitelistPrice ?? "");
          setTierMode(data.whitelistPrice == null || data.whitelistPrice === "" ? "__public" : data.whitelistPrice === "0" ? "0" : "__custom");
        }
      } catch {
        if (!cancelled) setAc(null);
      } finally {
        if (!cancelled) setAcLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [current.slug]);

  const revenue = current.receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const paid = Number(current.price) > 0;
  const revoked = current.status === "revoked";

  const whitelist = ac?.whitelist ?? [];
  const inviteOnly = ac?.publicAccess === false;
  const viewers = ac?.viewers ?? [];
  const entitlements = ac?.entitlements ?? [];
  const banned = entitlements.filter((e) => e.status === "banned");
  const revokedEnts = entitlements.filter((e) => e.status === "revoked");
  const activeEnt = new Set(entitlements.filter((e) => e.status === "active").map((e) => e.wallet));
  const entStatus = new Map(entitlements.map((e) => [e.wallet, e.status]));

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

  async function patchAccess(patch: { whitelist?: string[]; whitelistPrice?: string | null; publicAccess?: boolean }) {
    setBusy(true);
    try {
      const data = await nibshareApi.updateAccessPolicy(current.slug, patch);
      setAc((prev) => (prev ? { ...prev, whitelist: data.whitelist, whitelistPrice: data.whitelistPrice, publicAccess: data.publicAccess } : prev));
      setWlPriceInput((prev) => (patch.whitelistPrice !== undefined ? (data.whitelistPrice ?? "") : prev));
      if (Array.isArray(data.cutOffWallets) && data.cutOffWallets.length > 0) {
        const n = data.cutOffWallets.length;
        alert(`Made invite-only. ${n} wallet${n === 1 ? "" : "s"} that paid outside the whitelist ${n === 1 ? "was" : "were"} revoked.`);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update access');
    } finally {
      setBusy(false);
    }
  }

  function selectTierMode(mode: "__public" | "0" | "__custom") {
    setTierMode(mode);
    if (mode === "__public") {
      setWlPriceInput("");
      void patchAccess({ whitelistPrice: null });
    } else if (mode === "0") {
      setWlPriceInput("0");
      void patchAccess({ whitelistPrice: "0" });
    }
  }

  async function handleToggleInvite() {
    if (inviteOnly) {
      if (!confirm("Open to the public? Anyone with the link (or who pays) will be able to view. Whitelisted wallets keep their price tier.")) return;
      await patchAccess({ publicAccess: true });
    } else {
      if (whitelist.length === 0) {
        alert("Add at least one whitelisted wallet before making this invite-only.");
        return;
      }
      await patchAccess({ publicAccess: false });
    }
  }

  async function saveWhitelistPrice() {
    const raw = wlPriceInput.trim();
    if (raw === "" || raw === null) {
      await patchAccess({ whitelistPrice: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      alert("Whitelist price must be a non-negative number");
      return;
    }
    await patchAccess({ whitelistPrice: String(n) });
  }

  async function handleRevokeWallet(wallet: string) {
    if (!confirm(`Soft-revoke ${fmtAddr(wallet)}? They keep nothing they already copied but may pay again to re-unlock.`)) return;
    setBusyWallets((prev) => new Set(prev).add(wallet));
    try {
      await nibshareApi.revokeWallet(current.slug, wallet);
      setAc((prev) => prev ? { ...prev, entitlements: upsertEnt(prev.entitlements, wallet, "revoked") } : prev);
    } catch (err: any) {
      alert(err.message || 'Failed to revoke access');
    } finally {
      setBusyWallets((prev) => { const next = new Set(prev); next.delete(wallet); return next; });
    }
  }

  async function handleBan(wallet: string) {
    if (!confirm(`Ban ${fmtAddr(wallet)}? Hard ban: they lose access now and can never pay/unlock again.`)) return;
    setBusyWallets((prev) => new Set(prev).add(wallet));
    try {
      await nibshareApi.banWallet(current.slug, wallet);
      setAc((prev) => prev ? {
        ...prev,
        entitlements: upsertEnt(prev.entitlements, wallet, "banned"),
        // Backend strips banned wallets from whitelist[]; mirror it locally so
        // the banned chip doesn't linger in the whitelist list until a reload.
        whitelist: (prev.whitelist || []).filter((w) => w !== wallet)
      } : prev);
    } catch (err: any) {
      alert(err.message || 'Failed to ban wallet');
    } finally {
      setBusyWallets((prev) => { const next = new Set(prev); next.delete(wallet); return next; });
    }
  }

  async function handleRestore(wallet: string) {
    setBusyWallets((prev) => new Set(prev).add(wallet));
    try {
      await nibshareApi.restoreWallet(current.slug, wallet);
      setAc((prev) => prev ? { ...prev, entitlements: upsertEnt(prev.entitlements, wallet, "active") } : prev);
    } catch (err: any) {
      alert(err.message || 'Failed to restore access');
    } finally {
      setBusyWallets((prev) => { const next = new Set(prev); next.delete(wallet); return next; });
    }
  }

  function upsertEnt(list: EntitlementRecord[], wallet: string, status: "active" | "revoked" | "banned"): EntitlementRecord[] {
    const others = list.filter((e) => e.wallet !== wallet);
    const now = new Date().toISOString();
    return [{ wallet, status, grantedAt: now, revokedAt: status === "active" ? null : now }, ...others];
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

  const sectionTitle: React.CSSProperties = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--muted)', margin: '0 0 8px' };

  const listRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)' };

  const pillBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };

  const banBtn: React.CSSProperties = { ...pillBtn, color: '#c44', borderColor: '#c448' };
  const revokeBtn: React.CSSProperties = { ...pillBtn, color: '#b45309', borderColor: '#b4530966' };
  const restoreBtn: React.CSSProperties = { ...pillBtn, color: '#7c9a6d', borderColor: '#7c9a6d66' };

  const rowActions = (wallet: string) => {
    const st = entStatus.get(wallet);
    const isBanned = st === "banned";
    return (
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {!isBanned && (
          <button style={revokeBtn} onClick={() => void handleRevokeWallet(wallet)} disabled={busyWallets.has(wallet)} title="Soft revoke: they may pay again">
            <FiRotateCcw size={11} /> Revoke
          </button>
        )}
        {!isBanned && (
          <button style={banBtn} onClick={() => void handleBan(wallet)} disabled={busyWallets.has(wallet)} title="Hard ban: they can never pay again">
            <FiUserX size={11} /> Ban
          </button>
        )}
        {isBanned && (
          <button style={restoreBtn} onClick={() => void handleRestore(wallet)} disabled={busyWallets.has(wallet)} title="Restore access">
            <FiUserCheck size={11} /> Restore
          </button>
        )}
      </div>
    );
  };

  const tierLabel = () => {
    const wl = ac?.whitelistPrice;
    if (wl == null || wl === "") return paid ? `Public price · ${formatUsd(Number(current.price))} USDC` : "Free";
    return Number(wl) === 0 ? "Free" : `${formatUsd(Number(wl))} USDC`;
  };

  const whitelistTierNote = () => {
    const wl = ac?.whitelistPrice;
    if (wl == null || wl === "") return "Whitelisted wallets pay the same as everyone else. Pick Free or Custom to give them a tier.";
    return Number(wl) === 0
      ? `Whitelisted wallets get access free of charge${paid ? " while public pays " + formatUsd(Number(current.price)) + " USDC" : ""}.`
      : `Whitelisted wallets pay ${formatUsd(Number(wl))} USDC${paid ? ` instead of ${formatUsd(Number(current.price))} USDC` : ""}.`;
  };

  const statusOf = Object.fromEntries(
    entitlements.filter((e) => e.status !== "active").map((e) => [e.wallet, e.status] as [string, "revoked" | "banned"])
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div
        className="nibshare-root"
        style={{ width: "100%", maxWidth: "520px", maxHeight: "82vh", overflowY: "auto", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--bg)", padding: "20px" }}
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
          <StatCard label="Public price" value={paid ? `${formatUsd(Number(current.price))} USDC` : "Free"} />
        </div>

        {/* Access / whitelist / tiers */}
        <div className="rounded-md border p-3 mb-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="flex items-center gap-1.5" style={sectionTitle}><FiLock size={11} /> Access</p>
          </div>

          {acLoading ? (
            <p className="text-xs py-2 text-center" style={{ color: "var(--muted)" }}>Loading…</p>
          ) : revoked ? (
            <p className="text-xs py-2 text-center" style={{ color: "var(--muted)" }}>Revoked posts are closed to everyone.</p>
          ) : (
            <>
              <p className="text-[10px] mb-1.5" style={{ color: "var(--muted)" }}>Who can unlock</p>
              <div className="flex gap-1 p-0.5 rounded-lg border mb-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                {[
                  { key: false, label: "Anyone with the link", icon: <FiUsers size={11} /> },
                  { key: true, label: "Invite only", icon: <FiLock size={11} /> },
                ].map((opt) => (
                  <button
                    key={String(opt.key)}
                    onClick={() => void handleToggleInvite()}
                    disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-md cursor-pointer"
                    style={inviteOnly === opt.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>

              {/* Pricing tiers */}
              <p className="text-[10px] mb-1" style={{ color: "var(--muted)" }}>Pricing tiers</p>
              <div className="rounded-md border mb-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between px-2.5 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs" >Public price</span>
                  <span className="text-xs font-semibold" style={{ color: "#7c9a6d" }}>{paid ? `${formatUsd(Number(current.price))} USDC` : "Free"}</span>
                </div>
                {whitelist.length > 0 ? (
                  <div className="px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs">Whitelisted wallets pay</span>
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{tierLabel()}</span>
                    </div>
                    <div className="flex gap-1 p-0.5 rounded-md border" style={{ borderColor: "var(--border)" }}>
                      {([
                        { key: "__public" as const, label: "Public price" },
                        { key: "0" as const, label: "Free" },
                        { key: "__custom" as const, label: "Custom" },
                      ]).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => void selectTierMode(opt.key)}
                          disabled={busy}
                          className="flex-1 text-[10px] font-semibold py-1 rounded-md cursor-pointer"
                          style={tierMode === opt.key ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {tierMode === "__custom" && (
                      <div className="flex gap-1.5">
                        <input
                          value={wlPriceInput}
                          onChange={(e) => setWlPriceInput(e.target.value)}
                          placeholder="0.00"
                          inputMode="decimal"
                          spellCheck={false}
                          className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-md border"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--fg)" }}
                        />
                        <button style={{ ...pillBtn, color: "var(--accent)", borderColor: "var(--accent)", justifyContent: 'center' }} onClick={saveWhitelistPrice} disabled={busy}>
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-2.5 py-2">
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>Add whitelisted wallets to set a supporter tier.</p>
                  </div>
                )}
              </div>

              {/* Whitelist members */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Whitelist</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>{whitelist.length} wallet{whitelist.length !== 1 ? "s" : ""}</span>
              </div>
              <WalletListEditor
                value={whitelist}
                onChange={(next) => void patchAccess({ whitelist: next })}
                statusOf={statusOf}
              />
              <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "var(--muted)" }}>
                {inviteOnly
                  ? "Invite-only: only whitelisted wallets can unlock, even if they are willing to pay."
                  : whitelistTierNote()}
              </p>
            </>
          )}
        </div>

        {/* Viewers */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold flex items-center gap-1" style={{ color: "var(--muted)" }}><FiEye size={11} /> Seen by</span>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>{viewers.length} wallet{viewers.length !== 1 ? "s" : ""}</span>
        </div>
        {acLoading ? (
          <p className="text-xs py-3 text-center" style={{ color: "var(--muted)" }}>Loading…</p>
        ) : viewers.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: "var(--muted)" }}>No connected wallets have viewed this yet.</p>
        ) : (
          <div className="flex flex-col mb-4">
            {viewers.map((v) => (
              <div key={v.wallet} style={listRow}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {fmtAddr(v.wallet)}{" "}
                    {entStatus.get(v.wallet) === "banned" && <span style={{ color: "#c44" }}>· banned</span>}
                    {entStatus.get(v.wallet) === "revoked" && <span style={{ color: "#b45309" }}>· revoked</span>}
                    {activeEnt.has(v.wallet) && <span style={{ color: "#7c9a6d" }}>· unlocked</span>}
                  </p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                    {v.count} view{v.count !== 1 ? "s" : ""} · {new Date(v.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!revoked && rowActions(v.wallet)}
              </div>
            ))}
          </div>
        )}

        {/* Revoked */}
        {revokedEnts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#b45309" }}>Revoked (may re-pay)</span>
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>{revokedEnts.length}</span>
            </div>
            <div className="flex flex-col">
              {revokedEnts.map((e) => (
                <div key={e.wallet} style={listRow}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{fmtAddr(e.wallet)}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                      Revoked {e.revokedAt ? new Date(e.revokedAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  {!revoked && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={restoreBtn} onClick={() => void handleRestore(e.wallet)} disabled={busyWallets.has(e.wallet)}>
                        <FiUserCheck size={11} /> Restore
                      </button>
                      <button style={banBtn} onClick={() => void handleBan(e.wallet)} disabled={busyWallets.has(e.wallet)}>
                        <FiUserX size={11} /> Ban
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Banned */}
        {banned.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#c44" }}>Banned (never again)</span>
              <span className="text-[10px]" style={{ color: "var(--muted)" }}>{banned.length}</span>
            </div>
            <div className="flex flex-col">
              {banned.map((e) => (
                <div key={e.wallet} style={listRow}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{fmtAddr(e.wallet)}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                      Banned {e.revokedAt ? new Date(e.revokedAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  {!revoked && (
                    <button style={restoreBtn} onClick={() => void handleRestore(e.wallet)} disabled={busyWallets.has(e.wallet)}>
                      <FiUserCheck size={11} /> Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Receipts</span>
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>{current.receipts.length} total</span>
        </div>
        {current.receipts.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--muted)" }}>No unlocks yet.</p>
        ) : (
          <div className="flex flex-col mb-4">
            {current.receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{shortAddress(r.payerWallet)}</p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                    {new Date(r.unlockedAt).toLocaleString()}{r.txHash ? ` · ${shortAddress(r.txHash)}` : ""}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="text-xs font-semibold shrink-0" style={{ color: Number(r.amount) > 0 ? "#7c9a6d" : "var(--muted)" }}>
                    {Number(r.amount) > 0 ? `${formatUsd(Number(r.amount))} USDC` : "Free"}
                  </span>
                </div>
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
