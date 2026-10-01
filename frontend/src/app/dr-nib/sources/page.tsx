"use client";

import { useEffect, useState } from "react";
import { drNibApi } from "@/lib/dr-nib-api";
import { PageHeader, TrustChip } from "@/components/dr-nib/common";

export default function SourcesPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await drNibApi.listRuns();
        const runs = (j.runs || []).slice(0, 5);
        const all: any[] = [];
        for (const r of runs) {
          try {
            const full = await drNibApi.getRun(r.id);
            for (const s of full.sources || []) all.push({ ...s, runTopic: full.brief?.topic });
          } catch {}
          if (all.length >= 30) break;
        }
        if (!cancelled) setItems(all);
      } catch { if (!cancelled) setItems([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (items || []).filter((s) =>
    !q || [s.title, s.domain, s.url].filter(Boolean).join(" ").toLowerCase().includes(q)
  );

  return (
    <div>
      <PageHeader eyebrow="Dr. Nib" title="Sources" desc="Everything runs have found and scored." />
      <div className="mb-5">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sources…"
          className="w-full border border-dark-gray/50 bg-white rounded-xl px-3 py-2 text-sm outline-none" />
      </div>
      {items === null ? (
        <p className="text-sm opacity-60">Loading sources…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm opacity-60">{q ? "No matching sources." : "Nothing saved yet. Sources from runs collect here."}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((s, i) => (
            <article key={s.id} className="overflow-hidden rounded-2xl border bg-white shadow-1 transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
              <div className="relative flex h-24 items-center justify-center" style={{ background: "linear-gradient(135deg,#14181d,#35414f)" }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-medium text-black">
                  {(s.domain || s.title || "?").trim()[0]?.toUpperCase() || "?"}
                </span>
                <div className="absolute right-3 top-3">
                  {typeof s.trust === "number" ? <TrustChip trust={s.trust >= 0.7 ? "high" : s.trust >= 0.4 ? "medium" : "low"} /> : null}
                </div>
                <div className="absolute left-3 top-3">
                  <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium uppercase text-white">[{i + 1}]</span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-[15px] font-medium leading-snug">{s.title || s.url}</h3>
                <div className="mt-3 flex items-center justify-between border-t border-dark-gray/30 pt-3">
                  <span className="break-all text-xs opacity-60">{s.domain || s.url}</span>
                  {/^https?:\/\//.test(s.url || "") ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-medium underline">Open →</a>
                  ) : null}
                </div>
                {s.runTopic ? <p className="mt-1.5 truncate text-[11px] opacity-50">From: {String(s.runTopic).slice(0, 80)}</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
