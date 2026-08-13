"use client";

import { useCallback, useEffect, useState } from "react";
import { FiUserX, FiUserCheck, FiRotateCcw, FiShieldOff, FiUsers } from "react-icons/fi";
import { apiAuthFetch } from "@/lib/api";
import { shortAddress } from "@/lib/wallet";

type Entitlement = {
  wallet: string;
  status: "active" | "revoked" | "banned";
  grantedAt: string;
  revokedAt: string | null;
};

type Viewer = {
  wallet: string;
  count: number;
  lastSeenAt: string;
};

type AccessControl = {
  whitelist: string[];
  whitelistPrice: string | null;
  publicAccess: boolean;
  entitlements: Entitlement[];
  viewers: Viewer[];
};

export default function AccessControlPanel({ postId }: { postId: string }) {
  const [ac, setAc] = useState<AccessControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyWallets, setBusyWallets] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    apiAuthFetch<AccessControl>(`/nibgate/posts/${postId}/access-control`)
      .then(setAc)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  async function act(wallet: string, action: "ban" | "revoke" | "restore") {
    setBusyWallets((prev) => new Set(prev).add(wallet));
    setError("");
    try {
      if (action === "restore") {
        await apiAuthFetch(`/nibgate/posts/${postId}/entitlements/${wallet}`, { method: "DELETE" });
      } else {
        await apiAuthFetch(`/nibgate/posts/${postId}/entitlements/${wallet}/${action}`, { method: "POST" });
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyWallets((prev) => { const next = new Set(prev); next.delete(wallet); return next; });
    }
  }

  const entitlements = ac?.entitlements ?? [];
  const viewers = ac?.viewers ?? [];
  const whitelist = ac?.whitelist ?? [];
  const bannedCount = entitlements.filter((e) => e.status === "banned").length;
  const revokedCount = entitlements.filter((e) => e.status === "revoked").length;

  if (loading) {
    return <p className="text-xs" style={{ color: "var(--muted)" }}>Loading access control…</p>;
  }

  return (
    <div className="rounded-lg border p-3 mt-8" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-1.5 mb-2">
        <FiUsers size={12} style={{ color: "var(--muted)" }} />
        <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Access control</span>
        {ac && (
          <span className="text-[10px] ml-auto" style={{ color: "var(--muted)" }}>
            {ac.whitelist.length} whitelisted
            {bannedCount > 0 && <> · {bannedCount} banned</>}
            {revokedCount > 0 && <> · {revokedCount} revoked</>}
          </span>
        )}
      </div>

      {error && <p className="text-[10px]" style={{ color: "#c44" }}>{error}</p>}

      {entitlements.length === 0 && viewers.length === 0 ? (
        <p className="text-xs py-2" style={{ color: "var(--muted)" }}>
          No unlocks yet. Once readers unlock this post, you can manage their access here.
        </p>
      ) : (
        <>
          {viewers.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--muted)" }}>Viewers</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>{viewers.length}</span>
              </div>
              <div className="flex flex-col">
                {viewers.map((v) => {
                  const ent = entitlements.find((e) => e.wallet === v.wallet);
                  const status = ent?.status || "active";
                  const isBusy = busyWallets.has(v.wallet);
                  return (
                    <div key={v.wallet} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <div className="min-w-0">
                        <span className="text-xs font-medium" style={{ color: status === "banned" ? "#c44" : status === "revoked" ? "#b45309" : "var(--fg)" }}>
                          {shortAddress(v.wallet)}
                        </span>
                        <span className="text-[10px] ml-1.5" style={{ color: "var(--muted)" }}>
                          {v.count}× {status !== "active" ? `· ${status}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {status === "active" ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => act(v.wallet, "revoke")}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border cursor-pointer disabled:opacity-50"
                              style={{ borderColor: "var(--border)", color: "#b45309" }}
                              title="Revoke access (keep payment)"
                            >
                              <FiRotateCcw size={10} /> Revoke
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => act(v.wallet, "ban")}
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border cursor-pointer disabled:opacity-50"
                              style={{ borderColor: "#c44", color: "#c44" }}
                              title="Ban — revoke access, cannot re-purchase"
                            >
                              <FiUserX size={10} /> Ban
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => act(v.wallet, "restore")}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border cursor-pointer disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "var(--fg)" }}
                            title="Restore access"
                          >
                            <FiUserCheck size={10} /> Restore
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {whitelist.length > 0 && (
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>
              <FiShieldOff size={10} className="inline mr-1" />
              {ac?.publicAccess === false ? "Invite-only" : "Public"} · whitelisted wallets pay{" "}
              {ac?.whitelistPrice == null || ac.whitelistPrice === "" ? "the public price" : ac.whitelistPrice === "0" ? "nothing (free)" : `${ac.whitelistPrice} USDC`}.
            </p>
          )}
        </>
      )}
    </div>
  );
}