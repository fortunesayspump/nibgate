"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";

const s = `
.gw-admin-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  padding: 24px;
}
.gw-admin-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: 6px;
  display: block;
}
.gw-admin-balance {
  font-size: 36px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--fg);
  line-height: 1;
}
.gw-admin-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.gw-admin-input:focus { border-color: var(--accent); }
.gw-admin-msg {
  font-size: 13px;
  color: var(--muted);
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg);
}
.gw-admin-msg.error { color: #c44; background: rgba(204,68,68,0.08); }
.gw-admin-msg.success { color: var(--accent); background: rgba(124,154,109,0.08); }
`;

export default function GatewayAdminPage() {
  const router = useRouter();
  const [balances, setBalances] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info"|"error"|"success">("info");

  async function loadBalances() {
    setLoading(true);
    try {
      const data = await apiAuthFetch<any>("/nibgate/gateway/balances");
      setBalances(data.balances || data);
    } catch (err: any) {
      setBalances(null);
      setMsg(err?.message || "Failed to load balances");
      setMsgType("error");
    }
    setLoading(false);
  }

  useEffect(() => { loadBalances(); }, []);

  async function handleDeposit() {
    if (!depositAmount) return;
    setMsg("Depositing...");
    setMsgType("info");
    try {
      const data = await apiAuthFetch<any>("/nibgate/gateway/deposit", {
        method: "POST",
        body: JSON.stringify({ amount: depositAmount }),
      });
      setMsg(data.txHash ? `Deposited ${depositAmount} USDC — tx: ${data.txHash.slice(0,10)}...` : "Deposit submitted");
      setMsgType("success");
      setDepositAmount("");
      loadBalances();
    } catch (err: any) {
      setMsg(err?.message || "Deposit failed");
      setMsgType("error");
    }
  }

  async function handleWithdraw() {
    if (!withdrawAmount || !withdrawAddr) return;
    setMsg("Withdrawing...");
    setMsgType("info");
    try {
      const data = await apiAuthFetch<any>("/nibgate/gateway/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount: withdrawAmount, recipient: withdrawAddr }),
      });
      setMsg(data.txHash ? `Withdrew ${withdrawAmount} USDC — tx: ${data.txHash.slice(0,10)}...` : "Withdrawal submitted");
      setMsgType("success");
      setWithdrawAmount("");
      loadBalances();
    } catch (err: any) {
      setMsg(err?.message || "Withdrawal failed");
      setMsgType("error");
    }
  }

  return (
    <div className="wrap" style={{ paddingTop: "2rem" }}>
      <style>{s}</style>
      <div className="small muted font-ui" style={{ marginBottom: "0.5em" }}>Admin</div>
      <h1 style={{ marginTop: 0, marginBottom: "0.15em" }}>Gateway Wallet</h1>
      <p className="small muted" style={{ marginTop: "0.5em", marginBottom: "2rem" }}>
        Manage your Circle Gateway wallet on Arc testnet.
      </p>

      <div className="gw-admin-card" style={{ marginBottom: "1.5rem" }}>
        <span className="gw-admin-label">Balance</span>
        {loading ? (
          <div className="gw-admin-balance">—</div>
        ) : balances ? (
          <div>
            {Object.entries(balances).filter(([k]) => k !== 'ok' && k !== 'address').map(([key, val]) => (
              <div key={key} style={{ marginBottom: "0.5rem" }}>
                <span className="gw-admin-balance">{String(val)}</span>
                <span style={{ fontSize: "14px", color: "var(--muted)", marginLeft: "8px" }}>{key}</span>
              </div>
            ))}
            {balances.address && (
              <div style={{ marginTop: "0.5rem" }}>
                <span className="gw-admin-label">Gateway address</span>
                <code style={{ fontSize: "13px", wordBreak: "break-all" }}>{balances.address}</code>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="gw-admin-balance" style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "1rem" }}>Gateway wallet not configured.</div>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
              Deposit/withdraw needs a Gateway wallet key on your server (<code>NIBGATE_BUYER_PRIVATE_KEY</code> env).<br />
              This is <strong>not</strong> for visitors — they just connect their own wallet via MetaMask to pay for content.<br /><br />
              For the unlock flow, set your recipient wallet in <strong>Settings → Payment settings → Default wallet</strong>.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="gw-admin-card">
          <span className="gw-admin-label">Deposit</span>
          <p className="small muted" style={{ margin: "0 0 12px" }}>Deposit USDC into your Gateway wallet for gas.</p>
          <input className="gw-admin-input" type="text" placeholder="Amount (USDC)" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
          <button className="gw-btn gw-btn-primary" style={{ marginTop: "10px", width: "100%" }} onClick={handleDeposit} disabled={!depositAmount}>Deposit</button>
        </div>
        <div className="gw-admin-card">
          <span className="gw-admin-label">Withdraw</span>
          <p className="small muted" style={{ margin: "0 0 12px" }}>Withdraw USDC from your Gateway wallet.</p>
          <input className="gw-admin-input" type="text" placeholder="Amount (USDC)" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} style={{ marginBottom: "8px" }} />
          <input className="gw-admin-input" type="text" placeholder="Recipient address" value={withdrawAddr} onChange={(e) => setWithdrawAddr(e.target.value)} />
          <button className="gw-btn gw-btn-primary" style={{ marginTop: "10px", width: "100%" }} onClick={handleWithdraw} disabled={!withdrawAmount || !withdrawAddr}>Withdraw</button>
        </div>
      </div>

      {msg && <div className={`gw-admin-msg ${msgType}`}>{msg}</div>}
    </div>
  );
}
