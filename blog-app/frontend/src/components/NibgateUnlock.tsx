"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window { ethereum?: unknown; }
}

type UnlockResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

export default function NibgateUnlock({ resource }: { resource: UnlockResource }) {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    async function init() {
      try {
        const mod = await import("@nibgate/sdk");
        if (!mod) return;

        mod.createHostedUnlock(resource, {
          connectButton: "[data-nibgate-connect]",
          disconnectButton: "[data-nibgate-disconnect]",
          unlockButton: "[data-nibgate-unlock]",
          walletLabel: "[data-nibgate-wallet-label]",
          status: "[data-nibgate-status]",
          unlockedTarget: "[data-nibgate-premium]",
          onUnlock() {
            window.location.reload();
          },
        });
      } catch (err) {
        console.error("Nibgate unlock failed to load:", err);
      }
    }

    init();
  }, [resource]);

  return (
    <aside className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-6 my-8">
      <span className="inline-block text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)] border border-[var(--accent)] rounded px-2 py-0.5 mb-4">
        Premium
      </span>
      <h2 className="text-xl font-semibold tracking-tight mb-1">Unlock this post</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Connect your wallet and pay {resource.price} USDC to read the full article.
      </p>

      <div className="border border-[var(--border)] rounded-lg p-4 mb-6 space-y-3">
        <span className="text-xs text-[var(--muted)]">Wallet</span>
        <strong data-nibgate-wallet-label className="text-sm font-mono break-all block">
          No wallet detected
        </strong>
        <div className="flex gap-3">
          <button type="button" data-nibgate-connect className="border border-[var(--border)] rounded-md px-4 py-2 text-xs font-semibold hover:bg-[var(--card-hover)] transition-colors cursor-pointer">Connect</button>
          <button type="button" data-nibgate-disconnect disabled className="border border-[var(--border)] rounded-md px-4 py-2 text-xs text-[var(--muted)] cursor-pointer disabled:opacity-40">Disconnect</button>
        </div>
      </div>

      <button type="button" data-nibgate-unlock className="w-full bg-[var(--fg)] text-[var(--bg)] border-0 rounded-md px-6 py-3 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
        Unlock for {resource.price} USDC
      </button>

      <p className="text-xs text-center text-[var(--muted)] mt-4" data-nibgate-status>
        {typeof window !== "undefined" && window.ethereum
          ? "Wallet detected. Connect to continue."
          : "No wallet detected. Install MetaMask to unlock."}
      </p>

      <div data-nibgate-premium hidden className="mt-6 border-t border-[var(--border)] pt-6">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)] border border-[var(--accent)] rounded px-2 py-0.5">Unlocked</span>
        <p className="text-sm text-[var(--fg)] mt-3">Content unlocked. Thank you for your support!</p>
      </div>
    </aside>
  );
}
