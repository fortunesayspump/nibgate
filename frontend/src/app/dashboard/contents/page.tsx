"use client";

import { useEffect, useState } from "react";

type DashboardContent = {
  id: string;
  title: string;
  contentType: string;
  price: number;
  metrics: number;
  websiteName: string;
  websiteDomain: string;
};

export default function ContentsPage() {
  const [content, setContent] = useState<DashboardContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadContent({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/hub/dashboard/content");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load content");
      setContent(data.content || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadContent({ showLoading: false });
    })();
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-medium">Your Contents</h2>
        <button onClick={() => loadContent()} className="rounded bg-black px-6 py-2 font-medium text-white">
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
        {loading ? (
          <p className="p-8 text-center opacity-70">Loading content...</p>
        ) : error ? (
          <p className="p-8 text-center text-red-500">{error}</p>
        ) : content.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-2xl font-medium">No synced content yet</h3>
            <p className="mx-auto mt-3 max-w-xl opacity-70">
              Content will appear here after a verified site syncs its Nibgate manifest.
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-sm opacity-80" style={{ borderColor: "var(--nib-border-soft)" }}>
                <th className="p-4 font-medium">Item</th>
                <th className="p-4 font-medium">Site</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Price</th>
                <th className="p-4 text-right font-medium">Events</th>
              </tr>
            </thead>
            <tbody>
              {content.map((item) => (
                <tr key={item.id} className="border-b" style={{ borderColor: "var(--nib-border-soft)" }}>
                  <td className="p-4 font-medium">{item.title}</td>
                  <td className="p-4 opacity-80">{item.websiteName || item.websiteDomain}</td>
                  <td className="p-4">{item.contentType}</td>
                  <td className="p-4">{item.price.toFixed(2)} USDC</td>
                  <td className="p-4 text-right">{item.metrics}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
