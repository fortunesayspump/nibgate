"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDisconnect } from "@nibgate/wallet/react";
import ThemeToggle from "@/components/ThemeToggle";
import { nibshareApi } from "../api";
import { shortAddress } from "../lib/shares";
import { HUB_SESSION_UPDATED_EVENT } from "@/lib/hubSession";
import { useNibgateConnect } from "@/lib/useNibgateConnect";
import type { MeResponse } from "../types";

function isHexAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address ?? "");
}

export default function ShareWallet() {
  const { connect, busy, error: connectError } = useNibgateConnect();
  const { disconnect } = useDisconnect();
  const [openMenu, setOpenMenu] = useState(false);
  const [hubAddress, setHubAddress] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data: MeResponse = await nibshareApi.me();
      const raw = (data.authenticated && data.user?.wallets?.[0]?.address) || "";
      setHubAddress(isHexAddress(raw) ? raw : null);
    } catch {
      setHubAddress(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(HUB_SESSION_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(HUB_SESSION_UPDATED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!openMenu) return;
    function onClickOutside(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [openMenu]);

  async function handleDisconnect() {
    try {
          await nibshareApi.logout();
    } catch {}
    disconnect();
    setHubAddress(null);
    setOpenMenu(false);
  }

  if (!hubAddress) {
    return (
      <div className="share-wallet" ref={menuRef}>
        <button type="button" className="share-wallet-btn" onClick={() => void connect()} disabled={busy}>
          {busy ? "Connecting..." : "Connect wallet"}
        </button>
        {connectError && (
          <div className="share-wallet-error" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, fontSize: "11px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #c446", background: "var(--bg, #fff)", color: "#c44", maxWidth: 260, whiteSpace: "normal" }}>
            {connectError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="share-wallet" ref={menuRef}>
      <button type="button" className="share-wallet-btn" onClick={() => setOpenMenu((v) => !v)}>
        {shortAddress(hubAddress)}
      </button>
      {openMenu && (
        <div className="share-wallet-dropdown">
          <Link href="/dashboard" className="share-wallet-item" onClick={() => setOpenMenu(false)}>
            Dashboard
          </Link>
          <div className="share-wallet-item share-wallet-item-theme">
            <span>Theme</span>
            <ThemeToggle />
          </div>
          <button type="button" className="share-wallet-item share-wallet-item-disconnect" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
