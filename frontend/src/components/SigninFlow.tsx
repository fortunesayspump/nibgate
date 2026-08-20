"use client";

import { useAppKit, useAppKitAccount, useAppKitProvider, signMessageWithProvider } from "@nibgate/wallet/react";
import type { Eip1193Provider } from "@nibgate/wallet";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSignInMessage } from "@nibgate/wallet";

type AuthUser = {
  id: string;
  walletAddress: string;
  username?: string | null;
  avatarUrl?: string | null;
};

type AuthState = "checking" | "ready" | "connecting" | "signing" | "signed-in" | "error";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The server returned a non-JSON response. Check that the backend is running.");
  }
}

export default function SigninFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard/profile";
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);
  const [status, setStatus] = useState<AuthState>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  const displayAddress = isConnected ? address : undefined;
  const isBusy = status === "checking" || status === "connecting" || status === "signing";

  const buttonLabel = useMemo(() => {
    if (status === "checking") return "Checking session...";
    if (status === "connecting") return "Opening wallet...";
    if (status === "signing") return "Waiting for signature...";
    if (status === "signed-in") return "Opening dashboard...";
    if (displayAddress) return `Sign in as ${shortAddress(displayAddress)}`;
    return "Connect wallet";
  }, [displayAddress, status]);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch("/auth/me", { credentials: "include" });
        const data = await readJson(res);
        if (!cancelled && data.authenticated) {
          setUser(data.user);
          setStatus("signed-in");
          router.replace(nextPath);
          return;
        }
      } catch {
        // A missing session should not block the sign-in screen.
      }

      if (!cancelled) setStatus("ready");
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  async function handleSignin() {
    setError("");

    let walletAddress = displayAddress;

    if (!walletAddress) {
      setStatus("connecting");
      try {
        await open();
        const started = Date.now();
        while (!addressRef.current && Date.now() - started < 30000) {
          await new Promise((r) => setTimeout(r, 200));
        }
        walletAddress = addressRef.current;
        if (!walletAddress) {
          setStatus("ready");
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Wallet connection failed.");
        setStatus("error");
        return;
      }
    }

    try {
      setStatus("signing");
      const nonceRes = await fetch("/auth/nonce", { credentials: "include" });
      const nonceData = await readJson(nonceRes);
      if (!nonceRes.ok) throw new Error(nonceData.error || "Could not request sign-in nonce.");

      const message = createSignInMessage({
        address: walletAddress as `0x${string}`,
        nonce: nonceData.nonce,
        domain: window.location.host,
        uri: window.location.origin,
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });
      if (!walletProvider || typeof walletProvider.request !== "function") {
        throw new Error("Wallet provider is not available. Reconnect your wallet and try again.");
      }
      const signature = (await signMessageWithProvider(walletProvider, walletAddress, message)) as `0x${string}`;
      const verifyRes = await fetch("/auth/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const verifyData = await readJson(verifyRes);
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.details || verifyData.error || "Wallet signature could not be verified.");
      }

      setUser(verifyData.user);
      setStatus("signed-in");
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setStatus("error");
    }
  }

  return (
    <div className="nibgate-signin-panel-inner space-y-5 bg-white/10 p-6 rounded-xl">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.08em] text-white/70">Creator wallet</p>
        <p className="text-xl leading-8 text-white">
          {user ? "You are signed in. Opening your dashboard." : "Connect the wallet that should own your Nibgate creator profile."}
        </p>
      </div>
      <button
        className="w-full bg-white text-black px-5 py-4 text-lg font-medium rounded-lg cursor-pointer hover:bg-gray-200 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={handleSignin}
        disabled={isBusy || status === "signed-in"}
      >
        {buttonLabel}
      </button>
      {displayAddress ? (
        <p className="text-sm leading-6 text-white/70">Connected wallet: {shortAddress(displayAddress)}</p>
      ) : (
        <p className="text-sm leading-6 text-white/70">Use a wallet-enabled browser. You will sign a gas-free message to create your creator session.</p>
      )}
      {error ? <p className="text-sm leading-6 text-red-200">{error}</p> : null}
    </div>
  );
}
