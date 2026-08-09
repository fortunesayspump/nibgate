"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAppKit, useDisconnect as useAppKitDisconnect } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";
import ThemeToggle from "@/components/ThemeToggle";
import { nibshareApi } from "../api";
import { shortAddress } from "../lib/shares";
import type { MeResponse } from "../types";

function isHexAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address ?? "");
}

export default function ShareWallet() {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { disconnect: disconnectAppKit } = useAppKitDisconnect();
  const [openMenu, setOpenMenu] = useState(false);
  const [hubAddress, setHubAddress] = useState<string | null>(null);

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
  }, [refresh]);

  async function handleDisconnect() {
    try {
      await nibshareApi.logout();
    } catch {}
    disconnect();
    void disconnectAppKit({ namespace: "eip155" });
    setHubAddress(null);
    setOpenMenu(false);
  }

  if (!hubAddress) {
    return (
      <div className="share-wallet">
        <button type="button" className="share-wallet-btn" onClick={() => void open()}>
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="share-wallet" onMouseEnter={() => setOpenMenu(true)} onMouseLeave={() => setOpenMenu(false)}>
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
