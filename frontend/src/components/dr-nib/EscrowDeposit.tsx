"use client";

// Onchain escrow deposit for a run: setBudget + approve + fund, all signed
// in the user's wallet. Same primitives as tips/unlocks (AppKit provider +
// viem walletClient + Arc chain guard) — no new signing patterns.
//
// The backend creates the job (anyone may); the user funds it. The run only
// starts once the job reads Funded for at least the plan estimate.

import { useState } from "react";
import type { Eip1193Provider } from "@nibgate/wallet";
import { useAppKitAccount, useAppKitProvider } from "@nibgate/wallet/react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData } from "viem";
import { activeArcChain } from "@nibgate/wallet/chain";
import { ensureArcNetwork } from "@nibgate/wallet/network";
import { getWalletErrorMessage, WALLET_ERRORS } from "@nibgate/wallet/errors";
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

export function EscrowDeposit({ runId, budgetCap, estimate, onFunded }: { runId: string; budgetCap: number; estimate?: number | null; onFunded: () => void }) {
  const { address } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");
  // The deposit is the working budget: any amount from the plan estimate up
  // to the cap. Deposits are one-shot (no top-ups), so pick deliberately —
  // the run pauses when it is spent.
  const minimum = Number.isFinite(Number(estimate)) && Number(estimate) > 0 ? Number(estimate) : Number(budgetCap || 0);
  const [deposit, setDeposit] = useState<string | null>(null);
  const chosen = deposit == null ? Number(budgetCap || 0) : Number(deposit) || 0;

  const amount = BigInt(Math.round(chosen * 1e6));

  async function run() {
    setError("");
    if (!address) { setError("Connect your wallet first."); return; }
    if (!(chosen >= minimum)) { setError(`Deposit at least the $${minimum.toFixed(2)} plan estimate.`); return; }
    try {
      const provider = walletProvider;
      if (!provider?.request) throw new Error("Wallet provider is not available.");
      await ensureArcNetwork(provider);
      const chain = activeArcChain();
      const wc: any = createWalletClient({ chain, account: address as `0x${string}`, transport: custom(provider) });
      // Sequential receipts: three rapid fire-and-forget sends reuse the same
      // nonce and only the first mines (seen live as a stuck "Confirming").
      const public_: any = createPublicClient({ chain, transport: custom(provider) });
      const sendAndMine = async (to: `0x${string}`, data: `0x${string}`) => {
        const hash = await wc.sendTransaction({ to, data });
        setTx(hash);
        await public_.waitForTransactionReceipt({ hash });
        return hash;
      };

      setStep("creating");
      const job: any = await drNibApi.createEscrow(runId, { client: address });
      const jobId = BigInt(job.jobId);
      const core = job.core as `0x${string}`;

      setStep("budget");
      await sendAndMine(
        core,
        encodeFunctionData({ abi: CORE_ABI, functionName: "setBudget", args: [jobId, amount, "0x"] }),
      );

      setStep("approving");
      await sendAndMine(
        USDC as `0x${string}`,
        encodeFunctionData({ abi: USDC_ABI, functionName: "approve", args: [core, amount] }),
      );

      setStep("funding");
      await sendAndMine(
        core,
        encodeFunctionData({ abi: CORE_ABI, functionName: "fund", args: [jobId, amount, "0x"] }),
      );

      setStep("confirming");
      // Backoff, not a flat 3s hammer: indexing lags and the chain read is
      // the slow part — ~2min of grace with fewer calls.
      let waitMs = 3000;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, waitMs));
        waitMs = Math.min(15000, waitMs * 1.4);
        const st: any = await drNibApi.getEscrow(runId);
        if (st?.job?.chain?.status === "Funded") {
          setStep("funded");
          onFunded();
          return;
        }
      }
      throw new Error("Funded state not observed yet — the funding tx may still be settling. Retry in a moment.");
    } catch (e: any) {
      // The wallet default ("Something went wrong with your wallet") mislabels
      // backend/stuck-confirmation failures as wallet failures (seen live:
      // the Fund click showed no feedback then blamed the wallet). Surface
      // the real reason unless it is genuinely a wallet-shaped error.
      const mapped = getWalletErrorMessage?.(e);
      setError(mapped && mapped !== WALLET_ERRORS.default ? mapped : (e?.message || "Deposit failed."));
      setStep("idle");
    }
  }

  if (step === "funded") {
    return (
      <div className="mt-4 border-2 border-black bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wider opacity-60">✓ Escrow funded</p>
        <p className="mt-1 text-sm">${chosen.toFixed(2)} USDC locked onchain. Unspent money returns automatically at settle.</p>
      </div>
    );
  }

  const busy = step !== "idle";
  const labels: Record<Step, string> = {
    idle: `Fund $${chosen.toFixed(2)} escrow`,
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
        Lock <strong>${chosen.toFixed(2)} USDC</strong> in the run&apos;s escrow (3 wallet confirmations).
        Stages draw from it; whatever is unspent returns to you at settle — enforced by contract, not promise.
        One-shot deposit (no top-ups): the run works against what you lock now and pauses when it runs out.
      </p>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <label htmlFor="drnib-deposit" className="opacity-60">Deposit (USDC)</label>
        <input id="drnib-deposit" type="number" min={minimum} step={0.1} value={deposit == null ? Number(budgetCap || 0) : deposit}
          onChange={(e) => setDeposit(e.target.value)}
          className="w-32 border border-dark-gray/50 bg-white px-3 py-1.5 text-sm" />
        <span className="text-xs opacity-60">min ${minimum.toFixed(2)} (plan estimate){Number(budgetCap) > minimum ? ` · cap $${Number(budgetCap).toFixed(2)}` : ""}</span>
      </div>
      <button onClick={run} disabled={busy || !(chosen >= minimum)} className="mt-3 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        title={!(chosen >= minimum) ? `Deposit at least $${minimum.toFixed(2)}` : undefined}>
        {labels[step]}
      </button>
      {tx && <p className="mt-2 break-all font-mono text-[11px] opacity-60">{tx}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
