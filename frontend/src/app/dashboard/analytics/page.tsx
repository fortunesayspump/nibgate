"use client";

import { useEffect, useState } from "react";

type Analytics = {
  totalViews: number;
  totalUnlocks: number;
  unlockRate: number;
  totalRevenue: number;
  recentEvents: Array<{
    id: string;
    type: string;
    revenue: number;
    websiteName: string;
    contentTitle: string;
    createdAt: string;
  }>;
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/hub/dashboard/analytics");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to load analytics");
        setAnalytics(data.analytics);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <h2 className="text-3xl font-medium">Deep Analytics</h2>
      {loading ? (
        <p className="opacity-70">Loading analytics...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <Stat label="Total Views" value={analytics?.totalViews ?? 0} />
            <Stat label="Unlocks" value={analytics?.totalUnlocks ?? 0} />
            <Stat label="Unlock Rate" value={`${Math.round((analytics?.unlockRate ?? 0) * 1000) / 10}%`} />
            <Stat label="Revenue" value={`${(analytics?.totalRevenue ?? 0).toFixed(2)} USDC`} />
          </div>
          <div className="rounded-2xl border p-8 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
            <h3 className="text-xl font-medium">Recent events</h3>
            {(analytics?.recentEvents.length ?? 0) === 0 ? (
              <p className="mt-3 opacity-70">No events have been recorded yet.</p>
            ) : (
              <div className="mt-6 space-y-3">
                {analytics?.recentEvents.map((event) => (
                  <div key={event.id} className="flex justify-between border-b pb-3" style={{ borderColor: "var(--nib-border-soft)" }}>
                    <span>{event.type} {event.contentTitle ? `- ${event.contentTitle}` : ""}</span>
                    <span className="opacity-70">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border p-6 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="mb-2 text-sm font-medium opacity-70">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
