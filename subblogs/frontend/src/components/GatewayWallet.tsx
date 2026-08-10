"use client";

import { useEffect, useRef } from "react";
import { ARC_TESTNET, getWalletErrorMessage, switchToArcNetwork } from "@nibgate/wallet";

const ARC_TESTNET_RPC = ARC_TESTNET.rpcUrl;
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const GATEWAY_API = "https://gateway-api-testnet.circle.com/v1";
const ARC_DOMAIN = 26;

const SEL_DEPOSIT = "0x47e7ef24";
const SEL_APPROVE = "0x095ea7b3";
const SEL_AVAIL_BALANCE = "0x3ccb64ae";
const SEL_GATEWAY_MINT = "0x9fb01cc5";

function pad32(hex: string): string {
  return hex.slice(2).padStart(64, "0");
}

function addr32(addr: string): string {
  return "000000000000000000000000" + addr.slice(2);
}

function uint256(v: bigint): string {
  return v.toString(16).padStart(64, "0");
}

function parse6(amount: string): bigint {
  const [w = "0", f = ""] = amount.split(".");
  return BigInt(w + f.padEnd(6, "0").slice(0, 6));
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
}

function rand32(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "0x" + Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(ARC_TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

async function balanceOf(address: string): Promise<string> {
  try {
    const hex = await rpc("eth_getBalance", [address, "latest"]);
    return (Number(BigInt(hex)) / 1e18).toFixed(4);
  } catch { return "\u2014"; }
}

async function gatewayBalance(address: string): Promise<string> {
  try {
    const d = SEL_AVAIL_BALANCE + addr32(USDC_ADDRESS) + addr32(address);
    const hex = await rpc("eth_call", [{ to: GATEWAY_WALLET, data: d }, "latest"]);
    return (Number(BigInt(hex)) / 1_000_000).toFixed(2) + " USDC";
  } catch { return "\u2014"; }
}

async function requestAccount(): Promise<string | null> {
  if (!window.ethereum) return null;
  try {
    const a = await window.ethereum.request({ method: "eth_requestAccounts" });
    return a?.length > 0 ? a[0] : null;
  } catch { return null; }
}

function qs(sel: string, c: HTMLElement): HTMLElement | null {
  return c.querySelector(sel);
}

function refreshBals(container: HTMLElement, addr: string) {
  balanceOf(addr).then(b => { const e = qs("[data-gw-wallet-balance]", container); if (e) e.textContent = b; });
  gatewayBalance(addr).then(b => { const e = qs("[data-gw-balance]", container); if (e) e.textContent = b; });
}

async function switchToArc() {
  if (!window.ethereum) return;
  await switchToArcNetwork(window.ethereum);
}

async function sendTx(tx: { to: string; data: string; from: string }): Promise<string> {
  if (!window.ethereum) throw new Error("No wallet");
  await switchToArc();
  return window.ethereum.request({ method: "eth_sendTransaction", params: [tx] });
}

async function approveAndDeposit(from: string, amount: bigint): Promise<string> {
  const ad = SEL_APPROVE + addr32(GATEWAY_WALLET) + uint256(amount);
  await sendTx({ from, to: USDC_ADDRESS, data: ad });
  const dd = SEL_DEPOSIT + addr32(USDC_ADDRESS) + uint256(amount);
  return sendTx({ from, to: GATEWAY_WALLET, data: dd });
}

function setConnected(container: HTMLElement, addr: string) {
  const btn = qs("[data-gw-connect]", container);
  if (btn) { btn.textContent = shortAddr(addr); btn.dataset.gwConnected = "true"; btn.style.borderColor = "var(--nibgate-muted, #999)"; btn.style.color = "var(--nibgate-muted, #999)"; }
  const lbl = container.querySelector('[data-gw-wallet-card] > div:first-child > div:first-child');
  if (lbl && lbl.textContent === "Wallet") lbl.textContent = "Connected";
}

function setDisconnected(container: HTMLElement) {
  const btn = qs("[data-gw-connect]", container) as HTMLElement;
  if (btn) { btn.textContent = "Connect"; delete btn.dataset.gwConnected; btn.style.borderColor = ""; btn.style.color = ""; }
  const lbl = container.querySelector('[data-gw-wallet-card] > div:first-child > div:first-child');
  if (lbl && (lbl.textContent === "Connected" || lbl.textContent?.startsWith("0x"))) lbl.textContent = "Wallet";
  const w = qs("[data-gw-wallet-balance]", container); if (w) w.textContent = "\u2014";
  const g = qs("[data-gw-balance]", container); if (g) g.textContent = "\u2014";
}

async function clientWithdraw(from: string, amount: bigint) {
  const usdc = USDC_ADDRESS.toLowerCase() as `0x${string}`;
  const gw = GATEWAY_WALLET.toLowerCase() as `0x${string}`;
  const minter = GATEWAY_MINTER.toLowerCase() as `0x${string}`;
  const f = from.toLowerCase() as `0x${string}`;
  const zero = ("0x" + "0".repeat(40)) as `0x${string}`;

  const maxFee = parse6("2.01");
  const maxBlock = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const valueStr = amount.toString();
  const maxBlockStr = maxBlock.toString();
  const maxFeeStr = maxFee.toString();

  const spec = {
    version: 1,
    sourceDomain: ARC_DOMAIN,
    destinationDomain: ARC_DOMAIN,
    sourceContract: ("0x" + pad32(gw)),
    destinationContract: ("0x" + pad32(minter)),
    sourceToken: ("0x" + pad32(usdc)),
    destinationToken: ("0x" + pad32(usdc)),
    sourceDepositor: ("0x" + pad32(f)),
    destinationRecipient: ("0x" + pad32(f)),
    sourceSigner: ("0x" + pad32(f)),
    destinationCaller: ("0x" + pad32(zero)),
    value: valueStr,
    salt: rand32(),
    hookData: "0x",
  };

  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
    ],
    TransferSpec: [
      { name: "version", type: "uint32" },
      { name: "sourceDomain", type: "uint32" },
      { name: "destinationDomain", type: "uint32" },
      { name: "sourceContract", type: "bytes32" },
      { name: "destinationContract", type: "bytes32" },
      { name: "sourceToken", type: "bytes32" },
      { name: "destinationToken", type: "bytes32" },
      { name: "sourceDepositor", type: "bytes32" },
      { name: "destinationRecipient", type: "bytes32" },
      { name: "sourceSigner", type: "bytes32" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "value", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "hookData", type: "bytes" },
    ],
    BurnIntent: [
      { name: "maxBlockHeight", type: "uint256" },
      { name: "maxFee", type: "uint256" },
      { name: "spec", type: "TransferSpec" },
    ],
  };

  const message = { maxBlockHeight: maxBlockStr, maxFee: maxFeeStr, spec };

  if (!window.ethereum) throw new Error("No wallet");
  await switchToArc();
  const signature = await window.ethereum.request({
    method: "eth_signTypedData_v4",
    params: [from, JSON.stringify({ domain: { name: "GatewayWallet", version: "1" }, types, primaryType: "BurnIntent", message })],
  });

  const apiRes = await fetch(GATEWAY_API + "/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ burnIntent: message, signature }]),
  });
  const result = await apiRes.json();
  if (!result.attestation || !result.signature) {
    throw new Error(result.message || "Gateway API error");
  }

  const mintData = encodeGatewayMint(result.attestation, result.signature);
  return sendTx({ from, to: GATEWAY_MINTER, data: mintData });
}

function hex32(v: number | bigint): string {
  return BigInt(v).toString(16).padStart(64, "0");
}

function encodeGatewayMint(attestation: string, signature: string): string {
  const aBytes = attestation.startsWith("0x") ? attestation.slice(2) : attestation;
  const sBytes = signature.startsWith("0x") ? signature.slice(2) : signature;
  const aLen = aBytes.length / 2;
  const sLen = sBytes.length / 2;
  const aPadded = aBytes.padEnd(Math.ceil(aBytes.length / 64) * 64, "0");
  const sPadded = sBytes.padEnd(Math.ceil(sBytes.length / 64) * 64, "0");

  const offS = 96 + aPadded.length / 2;

  return SEL_GATEWAY_MINT
    + hex32(64)    // offset to attestation
    + hex32(offS)  // offset to signature
    + hex32(aLen) + aPadded
    + hex32(sLen) + sPadded;
}

export default function GatewayWallet() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ address: null as string | null, destroyed: false });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const container: HTMLDivElement = el;

    stateRef.current.destroyed = false;
    import("@nibgate/sdk").then(async (mod) => {
      if (stateRef.current.destroyed) return;
      container.innerHTML = "";
    (mod as any).renderDefaultGatewayWalletUI(container, {});
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts?.length > 0) {
            stateRef.current.address = accounts[0];
            setConnected(container, accounts[0]);
            refreshBals(container, accounts[0]);
          }
        } catch {}
      }
    }).catch(console.error);

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const connectBtn = target.closest("[data-gw-connect]") as HTMLElement | null;
      const gwDeposit = target.closest("[data-gw-deposit]") as HTMLElement | null;
      const gwWithdraw = target.closest("[data-gw-withdraw]") as HTMLElement | null;
      const txEl = qs("[data-gw-tx]", container) as HTMLElement;

      if (connectBtn) {
        if (stateRef.current.address && connectBtn.dataset.gwConnected === "true") {
          stateRef.current.address = null;
          setDisconnected(container);
        } else {
          requestAccount().then((a) => {
            if (a && !stateRef.current.destroyed) { stateRef.current.address = a; setConnected(container, a); refreshBals(container, a); }
          });
        }
        return;
      }

      if (gwDeposit) {
        let addr = stateRef.current.address;
        if (!addr) { requestAccount().then((a) => { if (a && !stateRef.current.destroyed) { stateRef.current.address = a; setConnected(container, a); refreshBals(container, a); }}); return; }
        const input = qs("[data-gw-deposit-amount]", container) as HTMLInputElement;
        const amount = input?.value;
        if (!amount) return;
        if (txEl) { txEl.style.display = "none"; txEl.style.color = ""; }
        gwDeposit.setAttribute("disabled", "true");
        gwDeposit.textContent = "Approving\u2026";
        approveAndDeposit(addr, parse6(amount))
          .then(() => { if (txEl) { txEl.style.color = "var(--nibgate-success, #16a34a)"; txEl.textContent = "Successful deposit"; txEl.style.display = "block"; setTimeout(() => { txEl.style.display = "none"; }, 3000); } refreshBals(container, addr); })
          .catch((err) => { if (txEl) { txEl.textContent = `Error: ${getWalletErrorMessage(err) || err.message}`; txEl.style.display = "block"; txEl.style.color = "var(--nibgate-error, #dc2626)"; } })
          .finally(() => { gwDeposit.removeAttribute("disabled"); gwDeposit.textContent = "Deposit"; if (input) input.value = ""; });
        return;
      }

      if (gwWithdraw) {
        let addr = stateRef.current.address;
        if (!addr) { requestAccount().then((a) => { if (a && !stateRef.current.destroyed) { stateRef.current.address = a; setConnected(container, a); refreshBals(container, a); }}); return; }
        const input = qs("[data-gw-withdraw-amount]", container) as HTMLInputElement;
        const amount = input?.value;
        if (!amount) return;
        if (txEl) { txEl.style.display = "none"; txEl.style.color = ""; }
        gwWithdraw.setAttribute("disabled", "true");
        gwWithdraw.textContent = "Signing\u2026";
        clientWithdraw(addr, parse6(amount))
          .then(() => { if (txEl) { txEl.style.color = "var(--nibgate-success, #16a34a)"; txEl.textContent = "Successful withdrawal"; txEl.style.display = "block"; setTimeout(() => { txEl.style.display = "none"; }, 3000); } refreshBals(container, addr); })
          .catch((err) => { if (txEl) { txEl.textContent = `Error: ${getWalletErrorMessage(err) || err.message}`; txEl.style.display = "block"; txEl.style.color = "var(--nibgate-error, #dc2626)"; } })
          .finally(() => { gwWithdraw.removeAttribute("disabled"); gwWithdraw.textContent = "Withdraw to your wallet"; if (input) input.value = ""; });
        return;
      }
    }

    container.addEventListener("click", onClick);

    function onAccountsChanged(accounts: string[]) {
      if (stateRef.current.destroyed) return;
      if (accounts.length > 0) { stateRef.current.address = accounts[0]; setConnected(container!, accounts[0]); refreshBals(container!, accounts[0]); }
      else { stateRef.current.address = null; setDisconnected(container!); }
    }

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", onAccountsChanged);
      window.ethereum.on("chainChanged", () => { if (stateRef.current.address) refreshBals(container!, stateRef.current.address); });
    }

    const pollInterval = setInterval(() => {
      if (stateRef.current.address) refreshBals(container!, stateRef.current.address);
    }, 6000);

    return () => {
      clearInterval(pollInterval);
      stateRef.current.destroyed = true;
      container.removeEventListener("click", onClick);
      if (window.ethereum) window.ethereum.removeListener("accountsChanged", onAccountsChanged);
    };
  }, []);

  return <div ref={containerRef} />;
}
