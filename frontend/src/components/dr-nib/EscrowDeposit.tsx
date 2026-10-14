"use client";

// Onchain escrow deposit for a run: setBudget + approve + fund, all signed
// in the user's wallet. Same primitives as tips/unlocks (AppKit provider +
// viem walletClient + Arc chain guard) — no new signing patterns.
//
// The user creates and funds the job; the backend registers it. The run only
// starts once the job reads Funded for at least the plan estimate.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Eip1193Provider } from "@nibgate/wallet";
import { useAppKitAccount, useAppKitProvider, useWalletInfo } from "@nibgate/wallet/react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData, formatUnits } from "viem";
import { activeArcChain } from "@nibgate/wallet/chain";
import { ensureArcNetwork, repairArcNetwork } from "@nibgate/wallet/network";
import { getWalletErrorMessage, WALLET_ERRORS } from "@nibgate/wallet/errors";
import { createdJobFromReceipt, requireSuccessfulReceipt } from "@/lib/escrow-receipt";
import { drNibApi } from "@/lib/dr-nib-api";

const USDC = "0x3600000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CORE_ABI = [
  { name: "createJob", type: "function", stateMutability: "nonpayable", inputs: [{ name: "provider", type: "address" }, { name: "evaluator", type: "address" }, { name: "expiredAt", type: "uint256" }, { name: "description", type: "string" }, { name: "hook", type: "address" }], outputs: [{ name: "jobId", type: "uint256" }] },
  { name: "jobCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getJob", type: "function", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "client", type: "address" }, { name: "provider", type: "address" }, { name: "evaluator", type: "address" }, { name: "hook", type: "address" }, { name: "token", type: "address" }, { name: "budget", type: "uint256" }, { name: "expiredAt", type: "uint256" }, { name: "status", type: "uint8" }] },
  { name: "setBudget", type: "function", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "optParams", type: "bytes" }], outputs: [] },
  { name: "fund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "expectedBudget", type: "uint256" }, { name: "optParams", type: "bytes" }], outputs: [] },
] as const;
const USDC_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

type Step = "idle" | "switching" | "creating" | "budget" | "approving" | "funding" | "confirming" | "funded";

export function EscrowDeposit({ runId, budgetCap, estimate, onFunded }: { runId: string; budgetCap: number; estimate?: number | null; onFunded: () => void }) {
  const { address } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const { walletInfo } = useWalletInfo();
  // Active wallet name (MetaMask extension vs WalletConnect phone vs
  // embedded): routes sends through completely different infrastructure, so
  // a send failure without the wallet name is undiagnosable.
  const activeWalletName: string | null =
    (walletInfo as any)?.name || (walletInfo as any)?.walletName || null;
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");
  // The deposit is the working budget: any amount from the plan estimate up
  // to the cap. Deposits are one-shot (no top-ups), so pick deliberately —
  // the run pauses when it is spent.
  const minimum = Number.isFinite(Number(estimate)) && Number(estimate) > 0 ? Number(estimate) : Number(budgetCap || 0);
  const [deposit, setDeposit] = useState<string | null>(null);
  const chosen = deposit == null ? Number(budgetCap || 0) : Number(deposit) || 0;
  const validDeposit = Number.isFinite(chosen) && chosen >= minimum && chosen <= Number(budgetCap);
  const chain = activeArcChain();

  // Visible wallet-network state: the switch prompt lives inside the wallet
  // app (browsers forbid silent switching), so a mismatch must be SEEN here
  // with its own button — not discovered mid-Fund as a cryptic RPC error.
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  async function readChain() {
    try {
      const req = walletProvider?.request?.bind(walletProvider);
      if (!req) { setWalletChainId(null); return; }
      const id: any = await (req as any)({ method: "eth_chainId" });
      setWalletChainId(typeof id === "string" && /^0x/i.test(id) ? Number(id) : Number(id));
    } catch {
      setWalletChainId(null);
    }
  }
  useEffect(() => {
    if (!walletProvider || !address) { setWalletChainId(null); return; }
    readChain();
    const onChange = () => readChain();
    (walletProvider as any).on?.("chainChanged", onChange);
    return () => { (walletProvider as any).removeListener?.("chainChanged", onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletProvider, address]);
  async function switchOnly() {
    setError("");
    if (!walletProvider?.request) { setError("Wallet provider is not available."); return; }
    setSwitching(true);
    try {
      await ensureArcNetwork(walletProvider);
      await readChain();
    } catch (e: any) {
      const mapped = getWalletErrorMessage?.(e);
      setError(mapped && mapped !== WALLET_ERRORS.default ? mapped : (e?.message || "Network switch failed."));
    } finally {
      setSwitching(false);
    }
  }
  const onRightChain = walletChainId === chain.id;

  // Connection self-diagnosis: chain, RPC liveness, native gas, and USDC —
  // read through the user's own provider. A wallet with a stale/dead custom
  // RPC passes every other check (signatures work, balances read via our
  // backend) yet every broadcast dies at sendRawTransaction with an opaque
  // RPC error. This names the broken layer instead of guessing.
  type ConnDiag = { rpcOk: boolean | null; gas: string | null; usdc: string | null; syncing: boolean | null; blockNum: number | null };
  const [diag, setDiag] = useState<ConnDiag>({ rpcOk: null, gas: null, usdc: null, syncing: null, blockNum: null });
  const [repairing, setRepairing] = useState(false);
  // Fingerprint captured at send-failure time: chain, pending nonce, gas
  // price, and which wallet app signed — everything the failure depends on
  // that cannot be read remotely afterwards. Displayed + copyable so the
  // next failure arrives diagnosable instead of starting another round-trip.
  const [failSnap, setFailSnap] = useState<any | null>(null);
  const [snapCopied, setSnapCopied] = useState(false);
  function connectorName(): string {
    try {
      const eth: any = (window as any)?.ethereum;
      const provs: any[] = Array.isArray(eth?.providers) ? eth.providers : eth ? [eth] : [];
      const flags: string[] = [];
      for (const p of provs) {
        if (p?.isRabby) flags.push("rabby");
        else if (p?.isCoinbaseWallet) flags.push("coinbase");
        else if (p?.isTrust) flags.push("trust");
        else if (p?.isBraveWallet) flags.push("brave");
        else if (p?.isMetaMask) flags.push("metamask");
        else if (p) flags.push("injected");
      }
      return [...new Set(flags)].join("+") || "unknown";
    } catch {
      return "unknown";
    }
  }
  async function snapshotFailure(stepName: string, err: any) {
    const snap: any = { step: stepName, connector: connectorName(), at: new Date().toISOString() };
    if (activeWalletName) snap.activeWallet = activeWalletName;
    try {
      const req: any = (walletProvider as any)?.request?.bind(walletProvider);
      if (req && address) {
        const withTimeout = <T,>(p: Promise<T>, ms = 8000): Promise<T | null> =>
          Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
        const [cid, nonce, gp, sync, bn] = await Promise.all([
          withTimeout(req({ method: "eth_chainId" })),
          withTimeout(req({ method: "eth_getTransactionCount", params: [address, "pending"] })),
          withTimeout(req({ method: "eth_gasPrice" })),
          withTimeout(req({ method: "eth_syncing" })),
          withTimeout(req({ method: "eth_blockNumber" })),
        ]);
        if (cid != null) snap.chainId = typeof cid === "string" && /^0x/i.test(cid) ? Number(cid) : Number(cid);
        if (nonce != null) snap.noncePending = nonce;
        if (gp != null) snap.gasPriceWei = String(gp);
        if (sync != null && sync !== false) snap.syncing = sync;
        if (bn != null) snap.walletBlock = Number(bn);
      }
    } catch {
      /* best-effort — the raw error below is still shown */
    }
    snap.error = String(err?.message || err).slice(0, 600);
    setFailSnap(snap);
  }
  async function runDiag() {
    if (!walletProvider?.request || !address) return;
    const req: any = (walletProvider as any).request.bind(walletProvider);
    const withTimeout = <T,>(p: Promise<T>, ms = 9000): Promise<T | null> =>
      Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
    const d: ConnDiag = { rpcOk: null, gas: null, usdc: null, syncing: null, blockNum: null };
    try {
      const bn = await withTimeout(req({ method: "eth_blockNumber" }));
      d.rpcOk = bn != null;
      if (bn != null) {
        try { d.blockNum = Number(bn); } catch { /* ignore */ }
        // A node that is still syncing (or far behind) answers reads but
        // rejects broadcasts — the exact shape of an "everything looks fine
        // but every send dies" failure. Name it when present.
        const [sync, gasRaw, usdcRaw] = await Promise.all([
          withTimeout(req({ method: "eth_syncing" })),
          withTimeout(req({ method: "eth_getBalance", params: [address, "latest"] })),
          withTimeout(req({
            method: "eth_call",
            params: [{ to: USDC, data: encodeFunctionData({ abi: USDC_ABI, functionName: "balanceOf", args: [address as `0x${string}`] }) }, "latest"],
          })),
        ]);
        d.syncing = sync != null && sync !== false;
        if (gasRaw != null) {
          try { d.gas = formatUnits(BigInt(gasRaw as string), 18); } catch { /* ignore */ }
        }
        if (usdcRaw != null && String(usdcRaw).length > 2) {
          try { d.usdc = formatUnits(BigInt(usdcRaw as string), 6); } catch { /* ignore */ }
        }
      }
    } catch {
      d.rpcOk = false;
    }
    setDiag(d);
  }
  useEffect(() => {
    if (!walletProvider || !address) return;
    runDiag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletProvider, address, walletChainId]);
  async function repairOnly() {
    setError("");
    if (!walletProvider?.request) { setError("Wallet provider is not available."); return; }
    setRepairing(true);
    try {
      await repairArcNetwork(walletProvider);
      await readChain();
      await runDiag();
    } catch (e: any) {
      const mapped = getWalletErrorMessage?.(e);
      setError(mapped && mapped !== WALLET_ERRORS.default ? mapped : (e?.message || "Connection repair failed."));
    } finally {
      setRepairing(false);
    }
  }


  async function run() {
    setError("");
    setFailSnap(null);
    setSnapCopied(false);
    if (!address) { setError("Connect your wallet first."); return; }
    if (!validDeposit) { setError(`Choose a deposit between ${minimum.toFixed(2)} and your ${Number(budgetCap).toFixed(2)} USDC budget cap.`); return; }
    const amount = BigInt(Math.round(chosen * 1e6));
    try {
      const provider = walletProvider;
      if (!provider?.request) throw new Error("Wallet provider is not available.");
      // A dead wallet RPC fails every broadcast while everything else looks
      // fine — refuse early with the repair path instead of burning
      // signatures into reverts/timeouts.
      if (diag.rpcOk === false) {
        throw new Error(`Your wallet's ${chain.name} connection is not responding. Check the connection or reconnect your wallet, then try again.`);
      }
      // Busy from the first await: the network switch can take seconds (or
      // pop a wallet prompt), and until now the button sat idle through all
      // of it looking dead (seen live on Fund).
      setStep("switching");
      await ensureArcNetwork(provider);
      // Belt and suspenders: a tx signed with the wrong chainId is rejected
      // by the RPC with a cryptic error (seen live on Fund). Verify the
      // wallet is really where we think before asking for signatures.
      try {
        const id = await provider.request({ method: "eth_chainId" });
        const cur = typeof id === "string" && /^0x/i.test(id) ? Number(id) : Number(id);
        setWalletChainId(cur);
        if (cur !== chain.id) {
          throw new Error(`Your wallet is on chain ${cur}, but this needs Arc ${chain.id === 5042 ? "mainnet" : "testnet"} (${chain.id}). Switch networks in your wallet, then try again.`);
        }
      } catch (e: any) {
        if (/chain \d+/.test(e?.message || "")) throw e;
        /* unreadable — the switch above already did its best */
      }
      const wc: any = createWalletClient({ chain, account: address as `0x${string}`, transport: custom(provider) });
      // Sequential receipts: three rapid fire-and-forget sends reuse the same
      // nonce and only the first mines (seen live as a stuck "Confirming").
      const public_: any = createPublicClient({ chain, transport: custom(provider) });
      const sendAndMine = async (to: `0x${string}`, data: `0x${string}`, label: string) => {
        let hash: string;
        try {
          hash = await wc.sendTransaction({ to, data });
        } catch (e: any) {
          // The wallet's own broadcast failed: capture chain/nonce/gas/
          // connector NOW (unreadable after the fact) and stop — retrying
          // the same blind send just burns more signatures.
          await snapshotFailure(label, e);
          throw e;
        }
        setTx(hash);
        const receipt = await public_.waitForTransactionReceipt({ hash });
        return requireSuccessfulReceipt(receipt, label);
      };

      setStep("creating");
      // The USER's wallet opens the job: the stock core sets client =
      // msg.sender, so a backend-relayed create makes a keeper-cliented job
      // no user can ever fund (every relayed job failed exactly this way —
      // setBudget reverts "only client or provider"). Reuse an existing job
      // if the review already registered one.
      let job: any = (await drNibApi.getEscrow(runId))?.job;
      // GET returns { configured, job: { jobId, core, …, chain } }.
      if (job?.jobId) {
        // Defensive: a job cliented to someone else is unusable — surface it
        // instead of burning three txs into reverts. (Jobs opened by the old
        // relay flow are keeper-cliented; no user wallet can ever fund those.)
        const owner = String(address).toLowerCase();
        if (job.chain?.client && String(job.chain.client).toLowerCase() !== owner) {
          throw new Error("This run's escrow job can't be funded from your wallet (it was opened by another wallet or the old flow). Duplicate the run from Projects to start fresh with your own job.");
        }
      } else {
        const params: any = await drNibApi.createEscrow(runId, {});
        const createdReceipt = await sendAndMine(
          params.core as `0x${string}`,
          encodeFunctionData({
            abi: CORE_ABI, functionName: "createJob",
            args: [params.splitter as `0x${string}`, params.evaluator as `0x${string}`, BigInt(params.expiredAt), String(params.description || ""), ZERO_ADDRESS as `0x${string}`],
          }),
          "createJob",
        );
        const found = createdJobFromReceipt(createdReceipt, {
          core: params.core, client: address, provider: params.splitter,
          evaluator: params.evaluator, hook: ZERO_ADDRESS, expiredAt: params.expiredAt,
        });
        await drNibApi.registerEscrow(runId, found.toString());
        job = (await drNibApi.getEscrow(runId))?.job;
        if (!job?.jobId) throw new Error("Job registration failed — retry in a moment.");
      }
      const jobId = BigInt(job.jobId);
      const core = job.core as `0x${string}`;

      setStep("budget");
      await sendAndMine(
        core,
        encodeFunctionData({ abi: CORE_ABI, functionName: "setBudget", args: [jobId, amount, "0x"] }),
        "setBudget",
      );

      setStep("approving");
      await sendAndMine(
        USDC as `0x${string}`,
        encodeFunctionData({ abi: USDC_ABI, functionName: "approve", args: [core, amount] }),
        "approve",
      );

      setStep("funding");
      await sendAndMine(
        core,
        encodeFunctionData({ abi: CORE_ABI, functionName: "fund", args: [jobId, amount, "0x"] }),
        "fund",
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
    switching: "Confirm the network in your wallet…",
    creating: "1/4 Open the job in your wallet…",
    budget: "2/4 Confirm budget in wallet…",
    approving: "3/4 Confirm USDC approval…",
    funding: "4/4 Confirm deposit…",
    confirming: "Confirming onchain…",
    funded: "Funded",
  };

  return (
    <div className="mt-4 border-2 border-black bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider opacity-60">Onchain escrow</p>
      <p className="mt-1 text-sm leading-6">
        Lock <strong>${chosen.toFixed(2)} USDC</strong> in the run&apos;s escrow (4 wallet confirmations: open job, budget, approval, deposit).
        Stages draw from it; whatever is unspent returns to you at settle — enforced by contract, not promise.
        One-shot deposit (no top-ups): the run works against what you lock now and pauses when it runs out.
      </p>
      {address && (
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {walletChainId == null ? (
              <span className="opacity-60">Reading wallet network…</span>
            ) : onRightChain ? (
              <span>✓ Wallet on {chain.name}</span>
            ) : (
              <>
                <span className="font-medium text-red-700">Wallet is on chain {walletChainId} — this needs {chain.name} ({chain.id}).</span>
                <button onClick={switchOnly} disabled={busy || switching} className="border border-black bg-black px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {switching ? "Switching…" : "Switch network"}
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-70">
            <span>RPC: {diag.rpcOk == null ? "checking…" : diag.rpcOk ? "✓ live" : "✗ not responding"}</span>
            {diag.syncing === true && <span className="font-medium text-red-700">node syncing — broadcasts will fail until it catches up</span>}
            {diag.gas != null && <span>Gas money: {Number(diag.gas).toFixed(2)} USDC</span>}
            {diag.usdc != null && <span>Token balance: {Number(diag.usdc).toFixed(2)} USDC</span>}
            {diag.rpcOk === false && (
              <button onClick={repairOnly} disabled={busy || repairing} className="border border-dark-gray/60 bg-white px-3 py-1 text-xs font-medium hover:bg-black hover:text-white disabled:opacity-50">
                {repairing ? "Repairing…" : "Repair connection"}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-sm">
        <label htmlFor="drnib-deposit" className="opacity-60">Deposit (USDC)</label>
        <input id="drnib-deposit" type="number" min={minimum} max={Number(budgetCap)} step={0.1} value={deposit == null ? Number(budgetCap || 0) : deposit}
          onChange={(e) => setDeposit(e.target.value)}
          className="w-32 border border-dark-gray/50 bg-white px-3 py-1.5 text-sm" />
        <span className="text-xs opacity-60">min ${minimum.toFixed(2)} (plan estimate){Number(budgetCap) > minimum ? ` · cap $${Number(budgetCap).toFixed(2)}` : ""}</span>
      </div>
      <button onClick={run} disabled={busy || !validDeposit} className="mt-3 inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        title={!validDeposit ? `Choose ${minimum.toFixed(2)}–${Number(budgetCap).toFixed(2)}` : undefined}>
        {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        {labels[step]}
      </button>
      {tx && <p className="mt-2 break-all font-mono text-[11px] opacity-60">{tx}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {failSnap && (
        <div className="mt-2 border border-dark-gray/40 bg-white p-2">
          <p className="text-[11px] font-medium">
            Send failed on step “{failSnap.step}” · wallet: {failSnap.connector}
            {failSnap.chainId != null ? ` · chain ${failSnap.chainId}` : ""}
            {failSnap.noncePending != null ? ` · nonce ${failSnap.noncePending}` : ""}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] underline opacity-70">Error details</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-70">{JSON.stringify(failSnap, null, 1)}</pre>
          </details>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(failSnap));
                setSnapCopied(true);
                setTimeout(() => setSnapCopied(false), 2000);
              } catch { /* clipboard blocked — details visible above */ }
            }}
            className="mt-1 text-[11px] underline opacity-70 hover:opacity-100"
          >
            {snapCopied ? "✓ Copied" : "Copy error details"}
          </button>
        </div>
      )}
    </div>
  );
}
