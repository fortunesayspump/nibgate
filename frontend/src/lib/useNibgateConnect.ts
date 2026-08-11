"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { getWalletErrorMessage, isWalletRejection } from "@nibgate/wallet";

export function useNibgateConnect() {
  const { isConnected } = useAccount();
  const { open } = useAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) setError(null);
  }, [isConnected]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await open();
      return true;
    } catch (err: unknown) {
      if (!isWalletRejection(err)) setError(getWalletErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [open]);

  return { connect, busy, error };
}
