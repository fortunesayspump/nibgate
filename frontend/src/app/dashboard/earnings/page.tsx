"use client";

import { useEffect, useState } from "react";

type Earnings = {
  availableBalance: number;
  totalRevenue: number;
  transactions: Array<{
    id: string;
    amount: number;
    contentTitle: string;
    websiteName: string;
    createdAt: string;
  }>;
};

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/hub/dashboard/earnings");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to load earnings");
        setEarnings(data.earnings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load earnings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-medium">Earnings & Payouts</h2>
        <button className="cursor-not-allowed rounded bg-black/40 px-6 py-2 font-medium text-white" disabled>
          Withdraw USDC
        </button>
      </div>

      {loading ? (
        <p className="opacity-70">Loading earnings...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <>
          <div className="rounded-2xl border p-10 text-center shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
            <div className="text-sm font-medium uppercase tracking-widest opacity-60">Available Balance</div>
            <div className="mt-4 text-6xl font-bold tracking-tighter md:text-8xl">
              {(earnings?.availableBalance ?? 0).toFixed(2)} <span className="text-3xl opacity-50">USDC</span>
            </div>
            <div className="mt-4 text-sm opacity-70">Based on recorded paid unlock events.</div>
          </div>

          <div className="rounded-2xl border shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
            {(earnings?.transactions.length ?? 0) === 0 ? (
              <p className="p-8 text-center opacity-70">No paid unlock transactions have been recorded yet.</p>
            ) : (
              earnings?.transactions.map((transaction) => (
                <div key={transaction.id} className="flex justify-between border-b p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
                  <div>
                    <div className="font-medium">{transaction.contentTitle || "Paid unlock"}</div>
                    <div className="text-sm opacity-60">{new Date(transaction.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="font-medium text-green-600">+{transaction.amount.toFixed(2)} USDC</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
