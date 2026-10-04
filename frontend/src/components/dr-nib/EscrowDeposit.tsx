"use client";

// Onchain escrow deposit for a run: setBudget + approve + fund, all signed
// in the user's wallet. Same primitives as tips/unlocks (AppKit provider +
// viem walletClient + Arc chain guard) — no new signing patterns.
//
// The backend creates the job (anyone may); the user funds it. The run only
// starts once the job reads Funded for at least the cap.

import { useState } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { createWalletClient, custom, encodeFunctionData } from "viem";
import { activeArcChain } from "@nibgate/wallet/chain";
import { ensureArcNetwork } from "@nibgate/wallet/network";
import { getWalletErrorMessage } from "@nibgate/wallet/errors";
import { drNibApi } from "@/lib/dr-nib-api";

const USDC = "0x3600000000000000000000000000000000000000";
const CORE_ABI = [
  { name: "setBudget", type: "function", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { name: "fund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "expectedBudget", type: "uint256" }, { name: "optParams", type: "bytes" }], outputs: [] },
] as const;
const USDC_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

type Step = "idle" | "creating" | "budget" | "approving" | "funding" | "confirming" | "funded";

export function EscrowDeposit({ runId, budgetCap, onFunded }: { runId: string; budgetCap: number; onFunded: () => void }) {
  const { address } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider("eip155") as any;
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");

  const amount = BigInt(Math.round(Number(budgetCap || 0) * 1e6));

  async function run() {
    setError("");
    if (!address) { setError("Connect your wallet first."); return; }
    if (!(amount > BigInt(0))) { setError("Budget cap must be above zero."); return; }
    try {
      const provider = walletProvider;
      if (!provider?.request) throw new Error("Wallet provider is not available.");
      await ensureArcNetwork(provider);
      const wc: any = createWalletClient({ chain: activeArcChain(), account: address as `0x${string}`, transport: custom(provider) });

      setStep("creating");
      const job: any = await drNibApi.createEscrow(runId, { client: address });
      const jobId = BigInt(job.jobId);
      const core = job.core as `0x${string}`;

      setStep("budget");
      const h1 = await wc.sendTransaction({
        to: core,
        data: encodeFunctionData({ abi: CORE_ABI, functionName: "setBudget", args: [jobId, amount, "0x"] }),
      });
      setTx(h1);

      setStep("approving");
      const h2 = await wc.sendTransaction({
        to: USDC as `0x${string}`,
        data: encodeFunctionData({ abi: USDC_ABI, functionName: "approve", args: [core, amount] }),
      });
      setTx(h2);

      setStep("funding");
      const h3 = await wc.sendTransaction({
        to: core,
        data: encodeFunctionData({ abi: CORE_ABI, functionName: "fund", args: [jobId, amount, "0x"] }),
      });
      setTx(h3);

      setStep("confirming");
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st: any = await drNibApi.getEscrow(runId);
        if (st?.job?.chain?.status === "Funded") {
          setStep("funded");
          onFunded();
          return;
        }
      }
      throw new Error("Funded state not observed yet — the funding tx may still be settling. Retry in a moment.");
    } catch (e: any) {
      setError(getWalletErrorMessage?.(e) || e?.message || "Deposit failed.");
      setStep("idle");
    }
  }

  if (step === "funded") {
    return (
      <div className="mt-4 border-2 border-black bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wider opacity-60">✓ Escrow funded</p>
        <p className="mt-1 text-sm">${Number(budgetCap).toFixed(2)} USDC locked onchain. Unspent money returns automatically at settle.</p>
      </div>
    );
  }

  const busy = step !== "idle";
  const labels: Record<Step, string> = {
    idle: `Fund $${Number(budgetCap).toFixed(2)} escrow`,
    creating: "Opening the onchain job…",
    budget: "1/3 Confirm budget in wallet…",
    approving: "2/3 Confirm USDC approval…",
    funding: "3/3 Confirm deposit…",
    confirming: "Confirming onchain…",
    funded: "Funded",
  };

  return (
    <div className="mt-4 border-2 border-black bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider opacity-60">Onchain escrow</p>
      <p className="mt-1 text-sm leading-6">
        Lock <strong>${Number(budgetCap).toFixed(2)} USDC</strong> in the run&apos;s escrow (3 wallet confirmations).
        Stages draw from it; whatever is unspent returns to you at settle — enforced by contract, not promise.
      </p>
      <button onClick={run} disabled={busy} className="mt-3 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
        {labels[step]}
      </button>
      {tx && <p className="mt-2 break-all font-mono text-[11px] opacity-60">{tx}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
