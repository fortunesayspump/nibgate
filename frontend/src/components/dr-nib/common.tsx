export type Trust = "high" | "medium" | "low";

export function TrustChip({ trust }: { trust: Trust }) {
  const map: Record<Trust, { label: string; color: string; bg: string }> = {
    high: { label: "High", color: "#0b7a5b", bg: "rgba(15,140,100,0.12)" },
    medium: { label: "Medium", color: "#8a6d00", bg: "rgba(200,160,0,0.14)" },
    low: { label: "Low", color: "#a33b2e", bg: "rgba(190,60,40,0.12)" },
  };
  const t = map[trust] || map.medium;
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: t.color, background: t.bg }}>{t.label}</span>;
}

export function ProjectCard({ r }: { r: any }) {
  const covers = [
    "linear-gradient(135deg,#10110e,#2a3a22)",
    "linear-gradient(135deg,#1c1a18,#4f353d)",
    "linear-gradient(135deg,#14181d,#35414f)",
    "linear-gradient(135deg,#1a1812,#4f4b35)",
    "linear-gradient(135deg,#17141d,#40354f)",
  ];
  const h = [...String(r.id || "?")].reduce((a, c) => a + c.charCodeAt(0), 0);
  const topic = r.brief?.topic || r.title || "Untitled run";
  const depth = r.brief?.depth || r.depth || "standard";
  const live = ["draft", "planned", "running", "paused"].includes(r.status);
  const cap = Number(r.budgetCap || 0);
  const spent = Number(r.spent || 0);
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
  const exhausted = cap > 0 && spent >= cap && r.status !== "complete";
  const initial = (topic.trim()[0] || "N").toUpperCase();
  return (
    <article className="overflow-hidden rounded-2xl border bg-white shadow-1 transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
      <div className="relative flex h-36 items-center justify-center" style={{ background: covers[h % covers.length] }}>
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium uppercase text-white">{r.status}</span>
        </div>
        <div className="absolute right-3 top-3">
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium uppercase text-white">{depth}</span>
        </div>
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl font-medium text-black">{initial}</span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-xl font-medium leading-snug">{topic.length > 90 ? topic.slice(0, 90) + "…" : topic}</h3>
        </div>
        <p className="mt-2 text-sm leading-6 opacity-70">
          {depth} run · {(r.brief?.liveWeb ?? true) ? "live web sources" : "curated sources"} · exports to {((r.brief?.formats || ["pdf"]) as string[]).join(", ")}
        </p>
        <div className="mt-4 border-t border-dark-gray/30 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-base font-medium">Used ${spent.toFixed(2)} of ${cap.toFixed(2)}</span>
            <span className="text-2xl font-medium">{pct}%</span>
          </div>
          <div className="mt-2 h-3.5 w-full overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: exhausted ? "#a33b2e" : "var(--nib-teal)" }} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[13px] opacity-70">
            <span>
              Cap ${cap.toFixed(2)}
              {r.updatedAt ? ` · ${new Date(r.updatedAt).toLocaleDateString()}` : ""}
              {typeof r.sourceCount === "number" ? ` · ${r.sourceCount} sources` : ""}
            </span>
            {exhausted ? (
              <span className="font-medium" style={{ color: "#a33b2e" }}>Budget exhausted — run incomplete</span>
            ) : (
              <span>Open →</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function PageHeader({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">{eyebrow}</p>
        <h2 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 opacity-70">{desc}</p>
      </div>
      {action && <div className="flex gap-3">{action}</div>}
    </div>
  );
}
