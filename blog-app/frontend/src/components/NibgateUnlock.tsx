"use client";

import { useEffect, useState, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type UnlockResource = {
  id: string;
  title: string;
  type: string;
  price: string;
  path: string;
};

type AccessResult = {
  ok: boolean;
  status: number;
  payload?: { content?: string; error?: string };
};

export default function NibgateUnlock({ resource }: { resource: UnlockResource }) {
  const [status, setStatus] = useState<"loading" | "locked" | "unlocked" | "error">("loading");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);

  const subdomain = (() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.hostname.split(".");
    if (parts.length >= 3 && parts[0] !== "www") return parts[0];
    return "";
  })();

  const accessPath = `${API_BASE}/nibgate/access?path=${resource.path}&subdomain=${subdomain}`;

  const storedProof = (() => {
    try {
      return localStorage.getItem(`nibgate:payment-proof:${resource.id}`) || "";
    } catch { return ""; }
  })();

  async function checkAccess(): Promise<AccessResult> {
    const res = await fetch(accessPath, {
      headers: {
        accept: "application/json",
        ...(storedProof ? { "x-nibgate-payment-proof": storedProof } : {}),
      },
    });
    const payload = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, payload };
  }

  async function handleUnlock() {
    setStatus("loading");
    setError("");

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error("Install MetaMask to unlock.");

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (!address) throw new Error("No wallet connected.");

      // First, get the PAYMENT-REQUIRED challenge
      const challengeRes = await fetch(accessPath);
      if (challengeRes.status !== 402) {
        const data = await challengeRes.json();
        if (data?.content) {
          setContent(data.content);
          setStatus("unlocked");
          return;
        }
        throw new Error("Unexpected server response.");
      }

      const paymentRequiredHeader = challengeRes.headers.get("PAYMENT-REQUIRED") || "";
      if (!paymentRequiredHeader) throw new Error("No payment challenge from server.");

      const paymentRequired = JSON.parse(atob(paymentRequiredHeader));
      const option = (paymentRequired.accepts || []).find(
        (o: any) => o.extra?.name === "GatewayWalletBatched" && o.extra?.version === "1"
      );
      if (!option) throw new Error("No Gateway batching option available.");

      const { createCircleGatewayBrowserAdapter } = await import("@nibgate/sdk");
      const gateway = await createCircleGatewayBrowserAdapter({
        chainId: parseInt(option.network.split(":")[1]),
        signer: {
          address,
          signTypedData: async (params: any) => {
            const { createWalletClient, custom } = await import("viem");
            const wc = createWalletClient({ transport: custom(ethereum) });
            return wc.signTypedData({ account: address as `0x${string}`, ...params });
          },
        },
      });

      const { paymentSignature } = await gateway.pay({ resource: resource as any, paymentRequiredHeader });
      if (!paymentSignature) throw new Error("Failed to create payment signature.");

      // Send signed payment
      const payRes = await fetch(accessPath, {
        headers: {
          accept: "application/json",
          "payment-signature": paymentSignature,
        },
      });
      const payData = await payRes.json().catch(() => ({}));

      if (!payRes.ok) {
        throw new Error(payData.reason || payData.error || "Payment verification failed.");
      }

      // Store the unlock proof
      if (payData.unlockProof) {
        try {
          localStorage.setItem(`nibgate:payment-proof:${resource.id}`, payData.unlockProof);
        } catch {}
      }

      // Show content
      setContent(payData.content || "");
      setStatus("unlocked");
    } catch (err: any) {
      setError(err.message || "Unlock failed.");
      setStatus("locked");
    }
  }

  useEffect(() => {
    mounted.current = true;
    checkAccess().then((result) => {
      if (!mounted.current) return;
      if (result.ok && result.payload?.content) {
        setContent(result.payload.content);
        setStatus("unlocked");
      } else if (result.status === 402) {
        setStatus("locked");
      } else {
        setError(result.payload?.error || "Access check failed.");
        setStatus("error");
      }
    });
    return () => { mounted.current = false; };
  }, [resource.id]);

  if (status === "unlocked") {
    return <div className="prose prose-neutral dark:prose-invert" dangerouslySetInnerHTML={{ __html: content }} />;
  }

  if (status === "loading") {
    return <p style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>Checking access...</p>;
  }

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <p style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>{resource.price} USDC</p>
      <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>Pay to unlock this content</p>
      {error && <p style={{ color: "#dc2626", marginBottom: "1rem" }}>{error}</p>}
      <button
        onClick={handleUnlock}
        style={{
          padding: "1rem 2rem", fontSize: "1.125rem", fontWeight: 600,
          background: "var(--accent, #7c9a6d)", color: "#fff",
          border: "none", borderRadius: "0.75rem", cursor: "pointer",
        }}
      >
        Unlock for {resource.price} USDC
      </button>
    </div>
  );
}
