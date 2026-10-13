"use client";

import { useAppKitAccount, useNibgateConnect } from "@nibgate/wallet/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const requestedNext = searchParams.get("next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") && !/[\u0000-\u0020\u007f]/.test(requestedNext)
    ? requestedNext
    : "/dashboard/profile";
  const { connect, signIn, busy, status, error } = useNibgateConnect();
  const { address, isConnected } = useAppKitAccount();
  const mountedRef = useRef(true);
  const nextPathRef = useRef(nextPath);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { nextPathRef.current = nextPath; }, [nextPath]);
  const [checking, setChecking] = useState(true);
  const [sessionFound, setSessionFound] = useState(false);

  const displayAddress = isConnected ? address : undefined;
  const signedIn = sessionFound || status === "signed-in";
  const isBusy = checking || busy;

  const buttonLabel = useMemo(() => {
    if (checking) return "Checking session...";
    if (status === "connecting") return "Opening wallet...";
    if (status === "signing") return "Waiting for signature...";
    if (signedIn) return "Opening dashboard...";
    if (displayAddress) return `Sign in as ${shortAddress(displayAddress)}`;
    return "Connect wallet";
  }, [checking, displayAddress, signedIn, status]);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch("/auth/me", { credentials: "include" });
        const data = await readJson(res);
        if (!cancelled && res.ok && data.authenticated) {
          setSessionFound(true);
          router.replace(nextPath);
          return;
        }
      } catch {
        // A missing session should not block the sign-in screen.
      }

      if (!cancelled) setChecking(false);
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  async function handleSignin() {
    if (isBusy || signedIn) return;
    // The shared flow waits for the selected provider, checks authorization,
    // and uses the nonce endpoint's chain instead of a stale render closure.
    const ok = await (displayAddress ? signIn() : connect());
    if (ok && mountedRef.current && nextPathRef.current === nextPath) router.replace(nextPath);
  }

  return (
    <div className="nibgate-signin-panel-inner space-y-5 bg-white/10 p-6 rounded-xl">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.08em] text-white/70">Creator wallet</p>
        <p className="text-xl leading-8 text-white">
          {signedIn ? "You are signed in. Opening your dashboard." : "Connect the wallet that should own your Nibgate creator profile."}
        </p>
      </div>
      <button
        className="w-full bg-white text-black px-5 py-4 text-lg font-medium rounded-lg cursor-pointer hover:bg-gray-200 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={handleSignin}
        disabled={isBusy || signedIn}
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
