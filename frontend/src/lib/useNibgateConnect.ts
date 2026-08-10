"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnect, useSwitchChain, useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { arcTestnet } from "@/lib/wagmi";

export function useNibgateConnect() {
  const { connectors, connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { isConnected } = useAccount();
  const { open } = useAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) setError(null);
  }, [isConnected]);

  const hasInjected =
    typeof window !== "undefined" && typeof (window as unknown as { ethereum?: unknown }).ethereum !== "undefined";

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (hasInjected) {
        const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
        if (injected) {
          const result = await connectAsync({ connector: injected });
          if (result.chainId && result.chainId !== arcTestnet.id) {
            try {
              await switchChainAsync({ chainId: arcTestnet.id });
            } catch {}
          }
          return true;
        }
      }
      open();
      return false;
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      setError(e?.shortMessage || e?.message || "Could not connect to your wallet.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [connectors, connectAsync, switchChainAsync, open, hasInjected]);

  return { connect, busy, error, hasInjected };
}
