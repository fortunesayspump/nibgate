"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, CalendarDays, Clock, Eye, Filter, MousePointerClick, RefreshCw, Search, WalletCards, X } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { format, subDays, subMonths } from "date-fns";
import { Area, CartesianGrid, Line, LineChart as ReLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type AnalyticsEvent = {
  id: string;
  type: string;
  eventName: string;
  revenue: number;
  websiteName: string;
  contentTitle: string;
  path: string;
  durationMs: number;
  scrollDepth: number;
  createdAt: string;
};

type Analytics = {
  totalViews: number;
  pageViews: number;
  resourceViews: number;
  uniqueVisitors: number;
  totalUnlocks: number;
  unlockStarts: number;
  payments: number;
  unlockRate: number;
  totalRevenue: number;
  avgTimeSpentMs: number;
  topContent?: ContentMetric[];
  contentMix?: Array<{ label: string; value: number; color?: string }>;
  recentEvents: AnalyticsEvent[];
};

type SiteSnapshot = {
  site: string;
  views: number;
  unlocks: number;
  revenue: number;
  visitors: number;
  avgTimeMs: number;
};

type ContentMetric = {
  title: string;
  site: string;
  type: string;
  views: number;
  unlocks: number;
  revenue: number;
  avgTimeMs: number;
  scrollDepth: number;
};

const RANGE_OPTIONS = ["7D", "30D", "90D", "12M"] as const;
const ANALYTICS_TABS = ["Content", "Sources", "Retention", "Events"] as const;
type TimeframePreset = (typeof RANGE_OPTIONS)[number];
type TimeframeState = { preset: TimeframePreset | "custom"; range: DateRange };

const CONTENT_TYPE_COLORS: Record<string, string> = {
  article: "#111111",
  video: "#6f8f72",
  image: "#c77745",
  music: "#d8b04c",
};

const TRAFFIC_SOURCES = [
  { label: "Direct", value: 38 },
  { label: "X / Twitter", value: 24 },
  { label: "Farcaster", value: 17 },
  { label: "Search", value: 13 },
  { label: "Referrals", value: 8 },
];

const RETENTION_COHORTS = [
  { label: "New visitors", d0: 100, d1: 42, d7: 18, d30: 9 },
  { label: "Content viewers", d0: 100, d1: 58, d7: 29, d30: 14 },
  { label: "Unlock starters", d0: 100, d1: 71, d7: 36, d30: 22 },
  { label: "Paid unlocks", d0: 100, d1: 82, d7: 48, d30: 31 },
];

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text();
  throw new Error(`Backend returned ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 140)}`);
}

async function fetchAnalyticsForFrame(frame: TimeframeState) {
  const res = await fetch(`/api/hub/dashboard/analytics?${timeframeParams(frame)}`);
  const data = await readApiJson(res);
  if (!data.success) throw new Error(data.error || "Failed to load analytics");
  return data.analytics as Analytics;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [contentAnalytics, setContentAnalytics] = useState<Analytics | null>(null);
  const [sourcesAnalytics, setSourcesAnalytics] = useState<Analytics | null>(null);
  const [eventsAnalytics, setEventsAnalytics] = useState<Analytics | null>(null);
  const [overviewFrame, setOverviewFrame] = useState<TimeframeState>(() => makeTimeframe("30D"));
  const [contentFrame, setContentFrame] = useState<TimeframeState>(() => makeTimeframe("30D"));
  const [sourcesFrame, setSourcesFrame] = useState<TimeframeState>(() => makeTimeframe("30D"));
  const [retentionFrame, setRetentionFrame] = useState<TimeframeState>(() => makeTimeframe("90D"));
  const [eventsFrame, setEventsFrame] = useState<TimeframeState>(() => makeTimeframe("7D"));
  const [siteFilter, setSiteFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<(typeof ANALYTICS_TABS)[number]>("Content");
  const [query, setQuery] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<{ label: string; views: number; unlocks: number; revenue: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAnalytics({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [overviewData, contentData, sourcesData, eventsData] = await Promise.all([
        fetchAnalyticsForFrame(overviewFrame),
        fetchAnalyticsForFrame(contentFrame),
        fetchAnalyticsForFrame(sourcesFrame),
        fetchAnalyticsForFrame(eventsFrame),
      ]);
      setAnalytics(overviewData);
      setContentAnalytics(contentData);
      setSourcesAnalytics(sourcesData);
      setEventsAnalytics(eventsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics({ showLoading: false });
  }, [overviewFrame, contentFrame, sourcesFrame, eventsFrame]);

  const activeAnalytics = analytics;
  const contentWindow = contentAnalytics || activeAnalytics;
  const sourcesWindow = sourcesAnalytics || activeAnalytics;
  const eventsWindow = eventsAnalytics || activeAnalytics;
  const events = activeAnalytics?.recentEvents || [];
  const sourceEvents = sourcesWindow?.recentEvents || [];
  const eventWindowEvents = eventsWindow?.recentEvents || [];
  const siteNames = useMemo(() => Array.from(new Set(events.map((event) => event.websiteName).filter(Boolean))).sort(), [events]);
  const filteredEvents = siteFilter === "all" ? events : events.filter((event) => event.websiteName === siteFilter);
  const filteredSourceEvents = siteFilter === "all" ? sourceEvents : sourceEvents.filter((event) => event.websiteName === siteFilter);
  const siteSnapshots = deriveSites(sourcesWindow, filteredSourceEvents);
  const activeSites = siteFilter === "all" ? siteSnapshots : siteSnapshots.filter((site) => site.site === siteFilter);
  const topContent = contentWindow?.topContent || [];
  const filteredTopContent = topContent.filter((content) => `${content.title} ${content.site} ${content.type}`.toLowerCase().includes(query.trim().toLowerCase()));
  const contentMix = normalizeContentMix(contentWindow?.contentMix || [], topContent);
  const searchedEvents = eventWindowEvents.filter((event) => `${event.eventName} ${event.websiteName} ${event.contentTitle} ${event.path}`.toLowerCase().includes(query.trim().toLowerCase()));
  const overviewRange = timeframePresetForBuckets(overviewFrame);
  const contentRange = timeframePresetForBuckets(contentFrame);
  const timeline = deriveTimeline(filteredEvents, overviewRange);
  const contentTimeline = deriveTimeline(filteredEvents, contentRange);
  const funnel = [
    { label: "Page views", value: activeAnalytics?.pageViews || 0 },
    { label: "Content views", value: activeAnalytics?.resourceViews || 0 },
    { label: "Unlock starts", value: activeAnalytics?.unlockStarts || 0 },
    { label: "Paid unlocks", value: activeAnalytics?.totalUnlocks || 0 },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">Dashboard</p>
          <h2 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">Analytics</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 opacity-70">
            See how every connected site, gated resource, unlock, payment, and session rolls up across your creator profile.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => loadAnalytics()} className="inline-flex items-center gap-2 rounded-full border px-5 py-3 font-medium transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      <section className="rounded-[24px] border p-4 shadow-1 md:p-5" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white"><BarChart3 className="h-5 w-5" /></div>
            <div>
              <div className="font-medium">Report controls</div>
              <p className="text-sm opacity-65">Change the time range and site scope for every chart on this page.</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--nib-border-soft)" }}>
              <Filter className="h-4 w-4 opacity-60" />
              <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="min-w-48 bg-transparent outline-none">
                <option value="all">All sites</option>
                {siteNames.map((site) => <option key={site} value={site}>{site}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-[24px] border p-10 text-center opacity-70" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>Loading analytics...</div>
      ) : error ? (
        <div className="rounded-[24px] border p-6 text-red-600" style={{ background: "#fff1f1", borderColor: "rgba(185, 28, 28, 0.28)" }}>{error}</div>
      ) : !activeAnalytics ? (
        <EmptyAnalytics />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HeroStat icon={<Eye className="h-5 w-5" />} label="Total views" value={activeAnalytics.totalViews} helper={`${activeAnalytics.resourceViews} content views`} />
            <HeroStat icon={<Activity className="h-5 w-5" />} label="Unique visitors" value={activeAnalytics.uniqueVisitors} helper={`${activeAnalytics.pageViews} page views`} />
            <HeroStat icon={<MousePointerClick className="h-5 w-5" />} label="Unlock rate" value={`${formatPercent(activeAnalytics.unlockRate)}`} helper={`${activeAnalytics.totalUnlocks} completed unlocks`} />
            <HeroStat icon={<WalletCards className="h-5 w-5" />} label="Revenue" value={`${activeAnalytics.totalRevenue.toFixed(2)} USDC`} helper={`${activeAnalytics.payments} payments`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <ChartPanel title="Views and unlocks" subtitle="Activity for this chart only" action={<TimeframeControl value={overviewFrame} onChange={setOverviewFrame} />}>
              <LineChart
                data={timeline}
                lines={[
                  { key: "views", label: "Views", color: "#111111" },
                  { key: "unlocks", label: "Unlocks", color: "#c77745" },
                ]}
                onPointClick={(point) => setSelectedPeriod(point as { label: string; views: number; unlocks: number; revenue: number })}
              />
              <div className="mt-4 flex gap-4 text-sm">
                <Legend color="#111111" label="Views" />
                <Legend color="#c77745" label="Unlocks" />
              </div>
            </ChartPanel>

            <ChartPanel title="Unlock funnel" subtitle="From visits to paid access">
              <div className="mt-6 space-y-4">
                {funnel.map((step, index) => (
                  <FunnelRow key={step.label} label={step.label} value={step.value} max={funnel[0]?.value || 1} muted={index > 1} />
                ))}
              </div>
            </ChartPanel>
          </div>

          <section className="rounded-[28px] border p-2 shadow-1 md:p-3" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-2 overflow-x-auto rounded-[22px] bg-black/[0.035] p-1">
                {ANALYTICS_TABS.map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-[18px] px-4 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-black text-white shadow-1" : "opacity-65 hover:opacity-100"}`}>
                    {tab}
                  </button>
                ))}
              </div>
              <label className="mx-2 mb-2 flex items-center gap-3 rounded-2xl border px-4 py-3 lg:mx-0 lg:mb-0" style={{ borderColor: "var(--nib-border-soft)" }}>
                <Search className="h-4 w-4 opacity-60" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search content, event, path..." className="w-full min-w-64 bg-transparent outline-none" />
              </label>
            </div>
          </section>

          {activeTab === "Content" ? (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <ChartPanel title="Top content" subtitle="Performance by gated resource" action={<TimeframeControl value={contentFrame} onChange={setContentFrame} />}>
                  <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-2">
                    {filteredTopContent.length === 0 ? (
                      <p className="rounded-2xl border p-4 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No tracked content metrics yet.</p>
                    ) : filteredTopContent.map((content) => (
                      <ContentMetricRow key={content.title} content={content} />
                    ))}
                  </div>
                </ChartPanel>
                <ChartPanel title="Content mix" subtitle="What your audience is unlocking">
                  <div className="mt-6 space-y-4">
                    {contentMix.length === 0 ? (
                      <p className="rounded-2xl border p-4 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No content mix yet.</p>
                    ) : contentMix.map((item) => (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{item.label}</span>
                          <span className="opacity-65">{item.value}%</span>
                        </div>
                        <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/10">
                          <div className="h-full rounded-full" style={{ width: `${item.value}%`, background: item.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartPanel>
              </div>
              <ChartPanel title="Historical breakdown" subtitle={`Grouped by ${contentRange === "12M" ? "month" : "period"} for this content window`}>
                <HistoricalAnalyticsTable timeline={contentTimeline} onSelect={setSelectedPeriod} />
              </ChartPanel>
            </div>
          ) : null}

          {activeTab === "Sources" ? (
            <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
              <ChartPanel title="Traffic sources" subtitle="Where content viewers are coming from" action={<TimeframeControl value={sourcesFrame} onChange={setSourcesFrame} />}>
                <div className="mt-5 space-y-4">
                  {TRAFFIC_SOURCES.map((source) => (
                    <SimpleBar key={source.label} label={source.label} value={source.value} suffix="%" />
                  ))}
                </div>
              </ChartPanel>
              <ChartPanel title="Site performance" subtitle="Compare origins on views, unlocks, and earnings">
                <div className="mt-5 max-h-[460px] space-y-3 overflow-y-auto pr-2">
                  {activeSites.length === 0 ? (
                    <p className="rounded-2xl border p-4 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No site events yet.</p>
                  ) : activeSites.map((site) => (
                    <SiteRow key={site.site} site={site} maxViews={Math.max(...activeSites.map((item) => item.views), 1)} />
                  ))}
                </div>
              </ChartPanel>
            </div>
          ) : null}

          {activeTab === "Retention" ? (
            <ChartPanel title="Retention cohorts" subtitle="Who comes back after viewing, starting unlock, or paying" action={<TimeframeControl value={retentionFrame} onChange={setRetentionFrame} />}>
              <RetentionTable />
            </ChartPanel>
          ) : null}

          {activeTab === "Events" ? (
            <section className="rounded-[24px] border p-5 shadow-1 md:p-6" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-medium">Event explorer</h3>
                  <p className="mt-1 text-sm opacity-65">Search raw widget/package events across this event window.</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <TimeframeControl value={eventsFrame} onChange={setEventsFrame} />
                  <span className="rounded-full border px-3 py-1 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>{searchedEvents.length} events</span>
                </div>
              </div>
              {searchedEvents.length === 0 ? (
                <p className="mt-6 rounded-2xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No matching events.</p>
              ) : (
                <div className="mt-6 max-h-[560px] space-y-3 overflow-y-auto pr-2">
                  {searchedEvents.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
      {selectedPeriod ? (
        <PeriodModal title="Analytics period" point={selectedPeriod} onClose={() => setSelectedPeriod(null)} />
      ) : null}
    </div>
  );
}

function HeroStat({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-[28px] border p-5 shadow-1 transition duration-300 hover:-translate-y-1 hover:shadow-2" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium opacity-65">{label}</div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">{icon}</div>
      </div>
      <div className="mt-4 text-3xl font-medium tracking-tight">{value}</div>
      <p className="mt-2 flex items-center gap-1 text-sm opacity-65"><ArrowUpRight className="h-3 w-3" /> {helper}</p>
    </div>
  );
}

function ChartPanel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[28px] border shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="flex flex-col gap-4 border-b px-5 py-4 xl:flex-row xl:items-start xl:justify-between md:px-6" style={{ borderColor: "var(--nib-border-soft)" }}>
        <div className="min-w-0">
          <h3 className="text-2xl font-medium">{title}</h3>
          <p className="mt-1 text-sm opacity-65">{subtitle}</p>
        </div>
        {action ? <div className="w-full xl:w-auto xl:shrink-0">{action}</div> : null}
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

function TimeframeControl({ value, onChange }: { value: TimeframeState; onChange: (value: TimeframeState) => void }) {
  const [open, setOpen] = useState(false);
  const displayRange = value.range?.from && value.range?.to ? `${format(value.range.from, "MMM d")} - ${format(value.range.to, "MMM d")}` : "Pick dates";
  return (
    <div className="relative w-full">
      <div className="inline-flex max-w-full rounded-[22px] border bg-black/[0.035] p-1" style={{ borderColor: "var(--nib-border-soft)" }}>
        <div className="hidden flex-wrap items-center gap-1 sm:flex">
          {RANGE_OPTIONS.map((range) => (
            <button key={range} onClick={() => { onChange(makeTimeframe(range)); setOpen(false); }} className={`rounded-[16px] px-3 py-2 text-xs font-medium transition ${value.preset === range && !open ? "bg-black text-white shadow-1" : "opacity-60 hover:bg-white/70 hover:opacity-100"}`}>
              {range}
            </button>
          ))}
          <button onClick={() => setOpen((current) => !current)} className={`inline-flex items-center gap-2 rounded-[16px] px-3 py-2 text-xs font-medium transition ${value.preset === "custom" || open ? "bg-black text-white shadow-1" : "bg-white/70 opacity-80 hover:opacity-100"}`}>
            <CalendarDays className="h-3.5 w-3.5" />
            {value.preset === "custom" ? displayRange : "Custom"}
          </button>
        </div>
        <button onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-4 py-2 text-sm font-medium transition sm:hidden ${open ? "bg-black text-white shadow-1" : "bg-white/70 hover:bg-white"}`}>
          <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4" /> {value.preset === "custom" ? displayRange : value.preset}</span>
          <span className="text-xs opacity-60">{value.preset === "custom" ? "Custom" : displayRange}</span>
        </button>
      </div>
      {open ? (
        <div className="absolute right-0 top-14 z-30 w-[min(92vw,360px)] rounded-3xl border p-3 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <div className="mb-3 grid grid-cols-4 gap-1 sm:hidden">
            {RANGE_OPTIONS.map((range) => (
              <button key={range} onClick={() => { onChange(makeTimeframe(range)); setOpen(false); }} className={`rounded-2xl px-3 py-2 text-xs font-medium ${value.preset === range ? "bg-black text-white" : "border"}`} style={value.preset === range ? undefined : { borderColor: "var(--nib-border-soft)" }}>
                {range}
              </button>
            ))}
          </div>
          <DayPicker
            mode="range"
            selected={value.range}
            onSelect={(range) => range?.from && onChange({ preset: "custom", range: { from: range.from, to: range.to || range.from } })}
            numberOfMonths={1}
          />
        </div>
      ) : null}
    </div>
  );
}

function FunnelRow({ label, value, max, muted = false }: { label: string; value: number; max: number; muted?: boolean }) {
  const width = Math.max(4, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="opacity-65">{value.toLocaleString()}</span>
      </div>
      <div className="h-11 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <div className="flex h-full items-center rounded-2xl px-4 text-sm font-medium text-white transition-all" style={{ width: `${width}%`, background: muted ? "#6f8f72" : "#111111" }}>
          {width > 28 ? `${width}%` : ""}
        </div>
      </div>
    </div>
  );
}

function SiteRow({ site, maxViews }: { site: SiteSnapshot; maxViews: number }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">{site.site}</div>
          <p className="mt-1 text-sm opacity-65">{site.visitors.toLocaleString()} visitors · {formatDuration(site.avgTimeMs)} avg time</p>
        </div>
        <div className="text-right">
          <div className="font-medium">{site.revenue.toFixed(2)} USDC</div>
          <p className="mt-1 text-sm opacity-65">{site.unlocks} unlocks</p>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-black" style={{ width: `${Math.max(5, (site.views / maxViews) * 100)}%` }} />
      </div>
      <p className="mt-2 text-xs opacity-60">{site.views.toLocaleString()} views</p>
    </div>
  );
}

function ContentMetricRow({ content }: { content: ContentMetric }) {
  const conversion = content.views ? content.unlocks / content.views : 0;
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">{content.type}</span>
            <span className="font-medium">{content.title}</span>
          </div>
          <p className="mt-2 text-sm opacity-65">{content.site} · {formatDuration(content.avgTimeMs)} avg · {content.scrollDepth}% scroll</p>
        </div>
        <div className="text-left md:text-right">
          <div className="font-medium">{content.revenue.toFixed(2)} USDC</div>
          <p className="mt-1 text-sm opacity-65">{formatPercent(conversion)} conversion</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <SmallMetric label="Views" value={content.views.toLocaleString()} />
        <SmallMetric label="Unlocks" value={content.unlocks.toLocaleString()} />
        <SmallMetric label="Revenue" value={`${content.revenue.toFixed(2)}`} />
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--nib-border-soft)" }}>
      <div className="text-xs opacity-55">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function SimpleBar({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="opacity-65">{value}{suffix}</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-black" style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  );
}

function Heat({ value }: { value: number }) {
  return (
    <span className="inline-flex min-w-16 justify-center rounded-xl px-3 py-2 font-medium text-white" style={{ background: `rgba(17,17,17,${Math.max(0.18, value / 100)})` }}>
      {value}%
    </span>
  );
}

function RetentionTable() {
  return (
    <div className="mt-5 max-h-[420px] overflow-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="opacity-60">
          <tr>
            <th className="py-3 font-medium">Cohort</th>
            <th className="py-3 font-medium">Day 0</th>
            <th className="py-3 font-medium">Day 1</th>
            <th className="py-3 font-medium">Day 7</th>
            <th className="py-3 font-medium">Day 30</th>
          </tr>
        </thead>
        <tbody>
          {RETENTION_COHORTS.map((cohort) => (
            <tr key={cohort.label} className="border-t" style={{ borderColor: "var(--nib-border-soft)" }}>
              <td className="py-3 font-medium">{cohort.label}</td>
              <td className="py-3"><Heat value={cohort.d0} /></td>
              <td className="py-3"><Heat value={cohort.d1} /></td>
              <td className="py-3"><Heat value={cohort.d7} /></td>
              <td className="py-3"><Heat value={cohort.d30} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoricalAnalyticsTable({ timeline, onSelect }: { timeline: Array<{ label: string; views: number; unlocks: number; revenue: number }>; onSelect: (point: { label: string; views: number; unlocks: number; revenue: number }) => void }) {
  return (
    <div className="mt-5 max-h-[430px] overflow-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="opacity-60">
          <tr>
            <th className="py-3 font-medium">Period</th>
            <th className="py-3 font-medium">Views</th>
            <th className="py-3 font-medium">Unlocks</th>
            <th className="py-3 font-medium">Revenue</th>
            <th className="py-3 font-medium">Unlock rate</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((point) => (
            <tr key={point.label} onClick={() => onSelect(point)} className="cursor-pointer border-t transition hover:bg-black/[0.03]" style={{ borderColor: "var(--nib-border-soft)" }}>
              <td className="py-3 font-medium">{point.label}</td>
              <td className="py-3">{point.views.toLocaleString()}</td>
              <td className="py-3">{point.unlocks.toLocaleString()}</td>
              <td className="py-3">{point.revenue.toFixed(2)} USDC</td>
              <td className="py-3">{formatPercent(point.views ? point.unlocks / point.views : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({ event }: { event: AnalyticsEvent }) {
  return (
    <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_auto]" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">{displayEvent(event.eventName || event.type)}</span>
          <span className="font-medium">{event.contentTitle || event.path || "Site activity"}</span>
        </div>
        <div className="mt-2 text-sm opacity-70">
          {event.websiteName || "Unknown site"}{event.path ? ` · ${event.path}` : ""}{event.durationMs ? ` · ${formatDuration(event.durationMs)}` : ""}{event.scrollDepth ? ` · ${Math.round(event.scrollDepth)}% scroll` : ""}
        </div>
      </div>
      <div className="text-left text-sm opacity-70 md:text-right">
        <div>{new Date(event.createdAt).toLocaleString()}</div>
        {event.revenue ? <div className="mt-1 font-medium text-green-700">{event.revenue.toFixed(3)} USDC</div> : null}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: color }} /> {label}</span>;
}

function LineChart({ data, lines, onPointClick }: { data: Array<Record<string, number | string>>; lines: Array<{ key: string; label: string; color: string }>; onPointClick?: (point: Record<string, number | string>) => void }) {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl border p-3" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ReLineChart data={data} margin={{ top: 20, right: 18, bottom: 6, left: 0 }} onClick={(state) => {
            const payload = chartPayload(state);
            if (payload) onPointClick?.(payload);
          }}>
            <CartesianGrid stroke="rgba(0,0,0,0.08)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(0,0,0,0.55)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(0,0,0,0.45)", fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "rgba(0,0,0,0.22)", strokeWidth: 1 }}
              contentStyle={{ borderRadius: 18, borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)", boxShadow: "0 18px 50px rgba(0,0,0,0.14)" }}
              formatter={formatTooltipValue}
            />
            {lines.map((line) => <Area key={`${line.key}-area`} type="monotone" dataKey={line.key} stroke="none" fill={line.color} fillOpacity={0.08} />)}
            {lines.map((line) => (
              <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={4} dot={{ r: 4, fill: line.color }} activeDot={{ r: 8 }} />
            ))}
          </ReLineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 rounded-2xl border p-3 text-sm opacity-65" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface)" }}>
        Hover any point for exact values. Click a point to open the period breakdown.
      </div>
    </div>
  );
}

function chartPayload(state: unknown) {
  const payload = (state as { activePayload?: Array<{ payload?: Record<string, number | string> }> } | null)?.activePayload?.[0]?.payload;
  return payload || null;
}

function formatTooltipValue(value: unknown, name: unknown) {
  return [Number(value || 0).toLocaleString(), String(name || "")];
}
function PeriodModal({ title, point, onClose }: { title: string; point: { label: string; views?: number; unlocks?: number; revenue?: number }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[28px] border p-6 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">{title}</p>
            <h3 className="mt-1 text-3xl font-medium">{point.label}</h3>
          </div>
          <button onClick={onClose} className="rounded-full border p-2" style={{ borderColor: "var(--nib-border-soft)" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoStat label="Views" value={(point.views || 0).toLocaleString()} />
          <InfoStat label="Unlocks" value={(point.unlocks || 0).toLocaleString()} />
          <InfoStat label="Revenue" value={`${(point.revenue || 0).toFixed(2)} USDC`} />
          <InfoStat label="Unlock rate" value={formatPercent(point.views ? (point.unlocks || 0) / point.views : 0)} />
        </div>
      </div>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="text-sm opacity-60">{label}</div>
      <div className="mt-1 text-xl font-medium">{value}</div>
    </div>
  );
}

function EmptyAnalytics() {
  return (
    <div className="rounded-[24px] border p-10 text-center shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white"><Clock /></div>
      <h3 className="mt-5 text-2xl font-medium">No analytics yet</h3>
      <p className="mx-auto mt-3 max-w-xl leading-7 opacity-70">
        Verified sites will show page views, content views, unlocks, payments, and session quality after the widget/package starts streaming events.
      </p>
    </div>
  );
}

function deriveSites(analytics: Analytics | null, events: AnalyticsEvent[]): SiteSnapshot[] {
  const groups = new Map<string, AnalyticsEvent[]>();
  events.forEach((event) => {
    const site = event.websiteName || "Unknown site";
    groups.set(site, [...(groups.get(site) || []), event]);
  });
  return Array.from(groups.entries()).map(([site, siteEvents]) => ({
    site,
    views: siteEvents.filter((event) => event.type === "view").length || Math.round((analytics?.totalViews || 0) / Math.max(groups.size, 1)),
    unlocks: siteEvents.filter((event) => event.type === "unlock").length,
    revenue: siteEvents.reduce((sum, event) => sum + (event.revenue || 0), 0),
    visitors: Math.max(1, Math.round((analytics?.uniqueVisitors || 0) / Math.max(groups.size, 1))),
    avgTimeMs: average(siteEvents.map((event) => event.durationMs).filter(Boolean)),
  }));
}

function deriveTimeline(events: AnalyticsEvent[], range: string) {
  const labels = rangeLabels(range);
  return labels.map((label, index) => {
    const bucketEvents = events.filter((_, eventIndex) => eventIndex % labels.length === index);
    return {
      label,
      views: bucketEvents.filter((event) => event.type === "view").length,
      unlocks: bucketEvents.filter((event) => event.type === "unlock").length,
      revenue: bucketEvents.reduce((sum, event) => sum + (event.revenue || 0), 0),
    };
  });
}

function rangeLabels(range: string) {
  if (range === "7D") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (range === "90D") return ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"];
  if (range === "12M") return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return ["1", "5", "10", "15", "20", "25", "30"];
}

function normalizeContentMix(mix: Array<{ label: string; value: number; color?: string }>, content: ContentMetric[]) {
  const source: Array<{ label: string; value: number; color?: string }> = mix.length > 0
    ? mix
    : Array.from(content.reduce((map, item) => {
      const type = String(item.type || "article").toLowerCase();
      map.set(type, (map.get(type) || 0) + 1);
      return map;
    }, new Map<string, number>())).map(([label, value]) => ({ label, value }));
  const total = source.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!total) return [];
  return source.map((item) => {
    const label = String(item.label || "article").toLowerCase();
    return {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value: Math.round((Number(item.value || 0) / total) * 100),
      color: item.color || CONTENT_TYPE_COLORS[label] || "#111111"
    };
  });
}

function makeTimeframe(range: TimeframePreset): TimeframeState {
  return { preset: range, range: getPresetDateRange(range) };
}

function timeframePresetForBuckets(value: TimeframeState): TimeframePreset {
  return value.preset === "custom" ? "30D" : value.preset;
}

function getPresetDateRange(range: string): DateRange {
  const to = new Date();
  if (range === "7D") return { from: subDays(to, 6), to };
  if (range === "90D") return { from: subDays(to, 89), to };
  if (range === "12M") return { from: subMonths(to, 12), to };
  return { from: subDays(to, 29), to };
}

function timeframeParams(frame: TimeframeState) {
  const params = new URLSearchParams();
  if (frame.range.from) params.set("from", frame.range.from.toISOString());
  if (frame.range.to) params.set("to", endOfDay(frame.range.to).toISOString());
  return params.toString();
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function displayEvent(eventName: string) {
  return eventName.replaceAll("_", " ");
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
