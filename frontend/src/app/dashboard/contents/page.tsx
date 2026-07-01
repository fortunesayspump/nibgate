"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Filter, RefreshCw, Search, X } from "lucide-react";

const CONTENT_TYPES = ["music", "video", "article", "image"] as const;

type DashboardContent = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  contentType: string;
  tags: string;
  url: string;
  price: number;
  metrics: number;
  views: number;
  unlocks: number;
  revenue: number;
  avgDurationMs: number;
  reputationScore?: number;
  reputationStars?: number;
  websiteName: string;
  websiteDomain: string;
  websiteVerified: boolean;
  websiteVerificationStatus: string;
  createdAt: string;
};

function normalizeContentType(type: string) {
  const clean = String(type || "").trim().toLowerCase();
  if ((CONTENT_TYPES as readonly string[]).includes(clean)) return clean;
  if (["audio", "song", "track", "album", "playlist"].includes(clean)) return "music";
  if (["photo", "picture", "illustration", "art"].includes(clean)) return "image";
  if (["movie", "clip"].includes(clean)) return "video";
  return "article";
}

function displayContentType(type: string) {
  const normalized = normalizeContentType(type);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text();
  throw new Error(`Backend returned ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 140)}`);
}

export default function ContentsPage() {
  const [content, setContent] = useState<DashboardContent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadContent({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/hub/dashboard/content");
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Failed to load content");
      setContent(data.content || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContent({ showLoading: false });
  }, []);

  const visibleContent = content;
  const selected = visibleContent.find((item) => item.id === selectedId) || null;
  const sites = useMemo(() => Array.from(new Set(visibleContent.map((item) => item.websiteDomain))).sort(), [visibleContent]);

  const filtered = visibleContent.filter((item) => {
    const matchesSite = siteFilter === "all" || item.websiteDomain === siteFilter;
    const matchesType = typeFilter === "all" || normalizeContentType(item.contentType) === typeFilter;
    const haystack = `${item.title} ${item.description} ${item.websiteName} ${item.websiteDomain} ${item.tags}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    return matchesSite && matchesType && matchesQuery;
  });

  const totals = filtered.reduce(
    (acc, item) => ({
      views: acc.views + item.views,
      unlocks: acc.unlocks + item.unlocks,
      revenue: acc.revenue + item.revenue,
      events: acc.events + item.metrics,
    }),
    { views: 0, unlocks: 0, revenue: 0, events: 0 }
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">Dashboard</p>
          <h2 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">Tracked content</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 opacity-70">
            Resources discovered from verified sites through the widget, content markers, and package events.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => loadContent()} className="inline-flex items-center gap-2 rounded-full border px-5 py-3 font-medium transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Content" value={filtered.length} />
        <Stat label="Views" value={totals.views} />
        <Stat label="Unlocks" value={totals.unlocks} />
        <Stat label="Revenue" value={`${totals.revenue.toFixed(2)} USDC`} />
      </div>

      <section className="rounded-[24px] border p-4 shadow-1 md:p-5" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
          <label className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--nib-border-soft)" }}>
            <Search className="h-4 w-4 opacity-60" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content, site, tags..." className="w-full bg-transparent outline-none" />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--nib-border-soft)" }}>
            <Filter className="h-4 w-4 opacity-60" />
            <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="w-full bg-transparent outline-none">
              <option value="all">All sites</option>
              {sites.map((site) => <option key={site} value={site}>{site}</option>)}
            </select>
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-2xl border bg-transparent px-4 py-3 outline-none" style={{ borderColor: "var(--nib-border-soft)" }}>
            <option value="all">All types</option>
            {CONTENT_TYPES.map((type) => <option key={type} value={type}>{displayContentType(type)}</option>)}
          </select>
        </div>
      </section>

      <section className="rounded-[24px] border shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
        {loading ? (
          <p className="p-8 text-center opacity-70">Loading content...</p>
        ) : error ? (
          <p className="p-8 text-center text-red-500">{error}</p>
        ) : visibleContent.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-2xl font-medium">No matches</h3>
            <p className="mx-auto mt-3 max-w-xl opacity-70">Try clearing your filters or search.</p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 xl:grid-cols-2">
            {filtered.map((item) => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} className="group text-left rounded-[22px] border p-4 transition hover:-translate-y-0.5 hover:shadow-1" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black text-white">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-medium group-hover:underline">{item.title}</h3>
                        <p className="mt-1 truncate text-sm opacity-65">{item.websiteName || item.websiteDomain}</p>
                      </div>
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">Verified</span>
                    </div>
                    {item.description ? <p className="mt-3 line-clamp-2 text-sm leading-6 opacity-70">{item.description}</p> : null}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                  <MiniStat label="Views" value={item.views} />
                  <MiniStat label="Unlocks" value={item.unlocks} />
                  <MiniStat label="Revenue" value={item.revenue.toFixed(2)} />
                  <MiniStat label="Reputation" value={stars(item.reputationStars)} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <div className="dashboard-drawer-backdrop fixed inset-0 z-[80] flex justify-end bg-black/35 p-0" onClick={() => setSelectedId(null)}>
          <aside className="dashboard-drawer-panel h-full w-full overflow-y-auto border-l p-5 shadow-2xl md:max-w-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">Content detail</p>
                <h3 className="mt-1 text-3xl font-medium">{selected.title}</h3>
                <p className="mt-2 text-sm opacity-65">{selected.websiteName || selected.websiteDomain}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Stat label="Views" value={selected.views} />
              <Stat label="Unlocks" value={selected.unlocks} />
              <Stat label="Revenue" value={`${selected.revenue.toFixed(2)} USDC`} />
              <Stat label="Reputation" value={stars(selected.reputationStars)} />
            </div>

            <div className="mt-6 space-y-4">
              <InfoBlock label="URL" value={selected.url} link />
              <InfoBlock label="Type" value={displayContentType(selected.contentType)} />
              <InfoBlock label="Price" value={`${selected.price.toFixed(2)} USDC`} />
              <InfoBlock label="Tags" value={selected.tags || "No tags yet"} />
              <InfoBlock label="Events" value={`${selected.metrics}`} />
              <InfoBlock label="Discovered" value={new Date(selected.createdAt).toLocaleString()} />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border p-5 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="text-sm font-medium opacity-65">{label}</div>
      <div className="mt-2 text-3xl font-medium">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: "var(--nib-border-soft)" }}>
      <div className="text-xs opacity-60">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function InfoBlock({ label, value, link = false }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="text-sm font-medium opacity-60">{label}</div>
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" className="mt-1 inline-flex break-all font-medium underline">
          {value} <ExternalLink className="ml-2 mt-1 h-3 w-3 shrink-0" />
        </a>
      ) : (
        <div className="mt-1 break-words font-medium">{value}</div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white"><FileText /></div>
      <h3 className="mt-5 text-2xl font-medium">No tracked content yet</h3>
      <p className="mx-auto mt-3 max-w-xl leading-7 opacity-70">
        Verified sites will show content here after the widget detects a resource marker or the Nibgate package emits resource activity.
      </p>
    </div>
  );
}

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function stars(value?: number) {
  const rating = Math.max(0, Math.min(5, value || 0));
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}
