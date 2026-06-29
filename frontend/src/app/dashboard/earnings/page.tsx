"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, Banknote, CalendarDays, Copy, CreditCard, ExternalLink, RefreshCw, Search, ShieldCheck, WalletCards, X } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { format, subDays, subMonths } from "date-fns";
import { Area, CartesianGrid, Line, LineChart as ReLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Transaction = {
  id: string;
  amount: number;
  contentTitle: string;
  websiteName: string;
  createdAt: string;
  txHash?: string;
  paymentId?: string;
  paymentProvider?: "circle-gateway" | "arc-testnet" | "x402" | string;
  receiptUrl?: string;
  chainExplorerUrl?: string;
  payer?: string;
  recipient?: string;
  network?: string;
  status?: string;
};

type Earnings = {
  availableBalance: number;
  totalRevenue: number;
  flow?: PaymentFlowMetric[];
  failureReasons?: Array<{ label: string; value: number }>;
  transactions: Transaction[];
};

type SiteEarning = {
  site: string;
  revenue: number;
  unlocks: number;
  avgUnlock: number;
};

type PaymentFlowMetric = {
  label: string;
  value: number;
  helper: string;
};

const RANGE_OPTIONS = ["7D", "30D", "90D", "12M"] as const;
const EARNINGS_TABS = ["Payments", "Sites", "Flow", "History"] as const;
type TimeframePreset = (typeof RANGE_OPTIONS)[number];
type TimeframeState = { preset: TimeframePreset | "custom"; range: DateRange };

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text();
  throw new Error(`Backend returned ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 140)}`);
}

async function fetchEarningsForFrame(frame: TimeframeState) {
  const res = await fetch(`/api/hub/dashboard/earnings?${timeframeParams(frame)}`);
  const data = await readApiJson(res);
  if (!data.success) throw new Error(data.error || "Failed to load earnings");
  return data.earnings as Earnings;
}

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [paymentsEarnings, setPaymentsEarnings] = useState<Earnings | null>(null);
  const [sitesEarnings, setSitesEarnings] = useState<Earnings | null>(null);
  const [flowEarnings, setFlowEarnings] = useState<Earnings | null>(null);
  const [historyEarnings, setHistoryEarnings] = useState<Earnings | null>(null);
  const [incomeFrame, setIncomeFrame] = useState<TimeframeState>(() => makeTimeframe("30D"));
  const [paymentsFrame, setPaymentsFrame] = useState<TimeframeState>(() => makeTimeframe("7D"));
  const [sitesFrame, setSitesFrame] = useState<TimeframeState>(() => makeTimeframe("90D"));
  const [flowFrame, setFlowFrame] = useState<TimeframeState>(() => makeTimeframe("30D"));
  const [historyFrame, setHistoryFrame] = useState<TimeframeState>(() => makeTimeframe("30D"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<{ label: string; revenue: number; unlocks: number } | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof EARNINGS_TABS)[number]>("Payments");
  const [query, setQuery] = useState("");

  async function loadEarnings({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [incomeData, paymentsData, sitesData, flowData, historyData] = await Promise.all([
        fetchEarningsForFrame(incomeFrame),
        fetchEarningsForFrame(paymentsFrame),
        fetchEarningsForFrame(sitesFrame),
        fetchEarningsForFrame(flowFrame),
        fetchEarningsForFrame(historyFrame),
      ]);
      setEarnings(incomeData);
      setPaymentsEarnings(paymentsData);
      setSitesEarnings(sitesData);
      setFlowEarnings(flowData);
      setHistoryEarnings(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load earnings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEarnings({ showLoading: false });
  }, [incomeFrame, paymentsFrame, sitesFrame, flowFrame, historyFrame]);

  const activeEarnings = earnings;
  const transactions = activeEarnings?.transactions || [];
  const paymentTransactions = paymentsEarnings?.transactions || [];
  const siteTransactions = sitesEarnings?.transactions || [];
  const flowWindow = flowEarnings || activeEarnings;
  const historyTransactions = historyEarnings?.transactions || [];
  const incomeRange = timeframePresetForBuckets(incomeFrame);
  const historyRange = timeframePresetForBuckets(historyFrame);
  const revenueSeries = deriveRevenueSeries(transactions, incomeRange);
  const historySeries = deriveRevenueSeries(historyTransactions, historyRange);
  const siteEarnings = deriveSiteEarnings(siteTransactions);
  const siteReceivers = deriveSiteReceivers(siteTransactions);
  const revenueByContent = deriveRevenueByContent(siteTransactions);
  const paymentFlow = flowWindow?.flow || [];
  const failureReasons = normalizeFailureReasons(flowWindow?.failureReasons || []);
  const verifiedAmount = transactions.filter((transaction) => (transaction.status || "verified") !== "reported").reduce((sum, transaction) => sum + transaction.amount, 0);
  const reportedAmount = Math.max(0, (activeEarnings?.totalRevenue || 0) - verifiedAmount);
  const avgUnlock = transactions.length ? (activeEarnings?.totalRevenue || 0) / transactions.length : 0;
  const searchedTransactions = paymentTransactions.filter((transaction) => `${transaction.id} ${transaction.txHash || ""} ${transaction.paymentId || ""} ${transaction.paymentProvider || ""} ${transaction.contentTitle} ${transaction.websiteName} ${transaction.payer || ""} ${transaction.recipient || ""} ${transaction.status || ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function copyAddress(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied("Address copied.");
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">Dashboard</p>
          <h2 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">Earnings</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 opacity-70">
            Track paid unlock revenue, receiving addresses, payment records, and historical performance across your creator sites.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => loadEarnings()} className="inline-flex items-center gap-2 rounded-full border px-5 py-3 font-medium transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {(copied || error) ? (
        <div className={`rounded-3xl border p-4 text-sm font-medium ${error ? "text-red-700" : "text-green-700"}`} style={{ background: error ? "#fff1f1" : "#eef8ef", borderColor: "var(--nib-border-soft)" }}>
          {error || copied}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[24px] border p-10 text-center opacity-70" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>Loading earnings...</div>
      ) : !activeEarnings ? (
        <EmptyEarnings />
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="overflow-hidden rounded-[28px] border shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
              <div className="p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">Recorded earnings</p>
                    <div className="mt-4 text-6xl font-medium tracking-tight md:text-8xl">
                      {activeEarnings.totalRevenue.toFixed(2)} <span className="text-2xl opacity-45 md:text-3xl">USDC</span>
                    </div>
                    <p className="mt-4 max-w-xl text-sm leading-6 opacity-70">
                      This is an accounting view of paid unlocks reported by your package/server flow. Nibgate does not custody this money or process withdrawals.
                    </p>
                  </div>
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
                    <WalletCards className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>
                  <ShieldCheck className="h-4 w-4" /> Non-custodial payments
                </div>
              </div>
              <div className="grid border-t md:grid-cols-3" style={{ borderColor: "var(--nib-border-soft)" }}>
                <MoneyStrip label="Paid unlock revenue" value={`${activeEarnings.totalRevenue.toFixed(2)} USDC`} />
                <MoneyStrip label="Verified payments" value={`${verifiedAmount.toFixed(2)} USDC`} />
                <MoneyStrip label="Reported events" value={`${reportedAmount.toFixed(2)} USDC`} />
              </div>
            </div>

            <div className="grid gap-4">
              <MiniMoney icon={<BadgeCheck className="h-5 w-5" />} label="Paid unlocks" value={transactions.length} helper={`${avgUnlock.toFixed(3)} USDC average`} />
              <MiniMoney icon={<ShieldCheck className="h-5 w-5" />} label="Verified revenue" value={`${verifiedAmount.toFixed(2)}`} helper="USDC confirmed" />
              <MiniMoney icon={<Banknote className="h-5 w-5" />} label="Receiving sites" value={siteEarnings.length} helper="with recorded income" />
            </div>
          </section>

          <div>
            <Panel title="Income trend" subtitle="Revenue and paid unlock volume for this chart" action={<TimeframeControl value={incomeFrame} onChange={setIncomeFrame} />}>
              <LineChart
                data={revenueSeries}
                lines={[
                  { key: "revenue", label: "Revenue", color: "#111111" },
                  { key: "unlocks", label: "Unlocks", color: "#6f8f72" },
                ]}
                onPointClick={(point) => setSelectedPeriod(point as { label: string; revenue: number; unlocks: number })}
              />
              <div className="mt-4 flex gap-4 text-sm">
                <Legend color="#111111" label="Revenue" />
                <Legend color="#6f8f72" label="Unlocks" />
              </div>
            </Panel>
          </div>

          <section className="rounded-[28px] border p-2 shadow-1 md:p-3" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-2 overflow-x-auto rounded-[22px] bg-black/[0.035] p-1">
                {EARNINGS_TABS.map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-[18px] px-4 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-black text-white shadow-1" : "opacity-65 hover:opacity-100"}`}>
                    {tab}
                  </button>
                ))}
              </div>
              <label className="mx-2 mb-2 flex items-center gap-3 rounded-2xl border px-4 py-3 lg:mx-0 lg:mb-0" style={{ borderColor: "var(--nib-border-soft)" }}>
                <Search className="h-4 w-4 opacity-60" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payment, site, address..." className="w-full min-w-64 bg-transparent outline-none" />
              </label>
            </div>
          </section>

          {activeTab === "Payments" ? (
            <Panel title="Payment history" subtitle="Unlock payment records reported by each site package" action={<TimeframeControl value={paymentsFrame} onChange={setPaymentsFrame} />}>
              <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-2">
                {searchedTransactions.length === 0 ? (
                  <p className="rounded-2xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No matching payment records.</p>
                ) : searchedTransactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} onOpen={() => setSelectedTransaction(transaction)} />
                ))}
              </div>
            </Panel>
          ) : null}

          {activeTab === "Sites" ? (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Revenue by site" subtitle="Which origins are driving paid access" action={<TimeframeControl value={sitesFrame} onChange={setSitesFrame} />}>
                  <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-2">
                    {siteEarnings.map((site) => (
                      <SiteRevenue key={site.site} site={site} max={Math.max(...siteEarnings.map((item) => item.revenue), 1)} />
                    ))}
                  </div>
                </Panel>
                <Panel title="Receiving addresses by site" subtitle="Each connected site can receive funds to its own address">
                  <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-2">
                    {siteReceivers.length === 0 ? (
                      <p className="rounded-2xl border p-4 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No receiving addresses reported yet.</p>
                    ) : siteReceivers.map((address) => (
                      <div key={address.site} className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{address.site}</div>
                            <p className="mt-1 text-xs opacity-60">{address.network} · {address.revenue.toFixed(2)} USDC recorded</p>
                          </div>
                          <button onClick={() => copyAddress(address.address)} className="rounded-full border p-2" style={{ borderColor: "var(--nib-border-soft)" }}><Copy className="h-4 w-4" /></button>
                        </div>
                        <p className="mt-3 break-all font-mono text-xs opacity-75">{address.address}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
              <Panel title="Revenue by content" subtitle="Which gated resources generated income">
                <RevenueByContentTable rows={revenueByContent} />
              </Panel>
            </div>
          ) : null}

          {activeTab === "Flow" ? (
            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <Panel title="Payment flow" subtitle="How many payment challenges turn into verified unlocks" action={<TimeframeControl value={flowFrame} onChange={setFlowFrame} />}>
                <div className="mt-5 space-y-4">
                  {paymentFlow.length === 0 ? (
                    <p className="rounded-2xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No payment flow events reported yet.</p>
                  ) : paymentFlow.map((step, index) => (
                    <FlowStep key={step.label} step={step} max={paymentFlow[0]?.value || 1} index={index} />
                  ))}
                </div>
              </Panel>
              <Panel title="Failed attempts" subtitle="Why payment attempts did not unlock content">
                <div className="mt-5 space-y-4">
                  {failureReasons.length === 0 ? (
                    <p className="rounded-2xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No failed payment attempts reported yet.</p>
                  ) : failureReasons.map((reason) => (
                    <SimpleBar key={reason.label} label={reason.label} value={reason.value} suffix="%" />
                  ))}
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === "History" ? (
            <Panel title="Historical revenue" subtitle={`Grouped by ${historyRange === "12M" ? "month" : "period"} across paid unlocks`} action={<TimeframeControl value={historyFrame} onChange={setHistoryFrame} />}>
              <HistoricalRevenueTable series={historySeries} onSelect={setSelectedPeriod} />
            </Panel>
          ) : null}
        </>
      )}
      {selectedPeriod ? <EarningsPeriodModal point={selectedPeriod} onClose={() => setSelectedPeriod(null)} /> : null}
      {selectedTransaction ? <ReceiptModal transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} /> : null}
    </div>
  );
}

function MoneyStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5">
      <div className="text-sm opacity-60">{label}</div>
      <div className="mt-1 text-xl font-medium">{value}</div>
    </div>
  );
}

function MiniMoney({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-[28px] border p-5 shadow-1 transition duration-300 hover:-translate-y-1 hover:shadow-2" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium opacity-65">{label}</div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">{icon}</div>
      </div>
      <div className="mt-4 text-3xl font-medium">{value}</div>
      <p className="mt-2 flex items-center gap-1 text-sm opacity-65"><ArrowUpRight className="h-3 w-3" /> {helper}</p>
    </div>
  );
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
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

function SiteRevenue({ site, max }: { site: SiteEarning; max: number }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">{site.site}</div>
          <p className="mt-1 text-sm opacity-65">{site.unlocks} unlocks · {site.avgUnlock.toFixed(3)} avg</p>
        </div>
        <div className="font-medium">{site.revenue.toFixed(2)} USDC</div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-black" style={{ width: `${Math.max(5, (site.revenue / max) * 100)}%` }} />
      </div>
    </div>
  );
}

function FlowStep({ step, max, index }: { step: PaymentFlowMetric; max: number; index: number }) {
  const width = Math.max(5, (step.value / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <span className="font-medium">{index + 1}. {step.label}</span>
          <p className="mt-1 opacity-60">{step.helper}</p>
        </div>
        <span className="font-medium">{step.value.toLocaleString()}</span>
      </div>
      <div className="mt-2 h-4 overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full bg-black" style={{ width: `${width}%` }} />
      </div>
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

function RevenueByContentTable({ rows }: { rows: Array<{ title: string; site: string; revenue: number; unlocks: number; recipient: string }> }) {
  return (
    <div className="mt-5 max-h-[420px] overflow-auto">
      {rows.length === 0 ? (
        <p className="rounded-2xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>No content revenue reported yet.</p>
      ) : (
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="opacity-60">
            <tr>
              <th className="py-3 font-medium">Content</th>
              <th className="py-3 font-medium">Site</th>
              <th className="py-3 font-medium">Revenue</th>
              <th className="py-3 font-medium">Unlocks</th>
              <th className="py-3 font-medium">Avg</th>
              <th className="py-3 font-medium">Receiver</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((content) => (
              <tr key={`${content.site}-${content.title}`} className="border-t" style={{ borderColor: "var(--nib-border-soft)" }}>
                <td className="py-3 font-medium">{content.title}</td>
                <td className="py-3">{content.site}</td>
                <td className="py-3">{content.revenue.toFixed(2)} USDC</td>
                <td className="py-3">{content.unlocks}</td>
                <td className="py-3">{(content.revenue / Math.max(content.unlocks, 1)).toFixed(3)} USDC</td>
                <td className="py-3 font-mono text-xs">{content.recipient || "Not reported"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoricalRevenueTable({ series, onSelect }: { series: Array<{ label: string; revenue: number; unlocks: number }>; onSelect: (point: { label: string; revenue: number; unlocks: number }) => void }) {
  return (
    <div className="mt-5 max-h-[420px] overflow-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="opacity-60">
          <tr>
            <th className="py-3 font-medium">Period</th>
            <th className="py-3 font-medium">Revenue</th>
            <th className="py-3 font-medium">Unlocks</th>
            <th className="py-3 font-medium">Average unlock</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.label} onClick={() => onSelect(point)} className="cursor-pointer border-t transition hover:bg-black/[0.03]" style={{ borderColor: "var(--nib-border-soft)" }}>
              <td className="py-3 font-medium">{point.label}</td>
              <td className="py-3">{point.revenue.toFixed(2)} USDC</td>
              <td className="py-3">{point.unlocks.toLocaleString()}</td>
              <td className="py-3">{point.unlocks ? (point.revenue / point.unlocks).toFixed(3) : "0.000"} USDC</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionRow({ transaction, onOpen }: { transaction: Transaction; onOpen: () => void }) {
  const status = transaction.status || "settled";
  return (
    <button onClick={onOpen} className="w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-1" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>{status}</span>
            <span className="font-medium">{transaction.contentTitle || "Paid unlock"}</span>
          </div>
          <p className="mt-2 text-sm opacity-65">{transaction.websiteName || "Unknown site"} · {new Date(transaction.createdAt).toLocaleString()}</p>
          <p className="mt-2 break-all font-mono text-xs opacity-55">{transaction.txHash || transaction.paymentId || transaction.id}</p>
        </div>
        <div className="text-left md:text-right">
          <div className="text-xl font-medium text-green-700">+{transaction.amount.toFixed(3)} USDC</div>
          <p className="mt-1 text-xs opacity-60">{transaction.network || "Recorded unlock"}</p>
        </div>
      </div>
    </button>
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
              formatter={(value: number, name: string) => [name === "Revenue" || name === "revenue" ? `${Number(value).toFixed(2)} USDC` : Number(value).toLocaleString(), name]}
            />
            {lines.map((line) => <Area key={`${line.key}-area`} type="monotone" dataKey={line.key} stroke="none" fill={line.color} fillOpacity={0.08} />)}
            {lines.map((line) => (
              <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={4} dot={{ r: 4, fill: line.color }} activeDot={{ r: 8, onClick: (_event, payload) => onPointClick?.(payload.payload) }} />
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

function EarningsPeriodModal({ point, onClose }: { point: { label: string; revenue: number; unlocks: number }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[28px] border p-6 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">Revenue period</p>
            <h3 className="mt-1 text-3xl font-medium">{point.label}</h3>
          </div>
          <button onClick={onClose} className="rounded-full border p-2" style={{ borderColor: "var(--nib-border-soft)" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoStat label="Revenue" value={`${point.revenue.toFixed(2)} USDC`} />
          <InfoStat label="Paid unlocks" value={point.unlocks.toLocaleString()} />
          <InfoStat label="Average unlock" value={`${point.unlocks ? (point.revenue / point.unlocks).toFixed(3) : "0.000"} USDC`} />
          <InfoStat label="Status" value="Recorded by package" />
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const receipt = getReceiptTarget(transaction);
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[28px] border p-6 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">Payment receipt</p>
            <h3 className="mt-1 text-3xl font-medium">{transaction.contentTitle || "Paid unlock"}</h3>
            <p className="mt-2 text-sm opacity-65">{transaction.websiteName || "Unknown site"} · {new Date(transaction.createdAt).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="rounded-full border p-2" style={{ borderColor: "var(--nib-border-soft)" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoStat label="Amount" value={`${transaction.amount.toFixed(3)} USDC`} />
          <InfoStat label="Status" value={transaction.status || "settled"} />
          <InfoStat label="Payment route" value={displayPaymentRoute(transaction)} />
          <InfoStat label="Payer" value={transaction.payer || "Not reported"} />
          <InfoStat label="Recipient" value={transaction.recipient || "Site receiver not reported"} />
          <InfoStat label="Payment id / hash" value={transaction.txHash || transaction.paymentId || transaction.id} />
        </div>
        {receipt ? (
          <a href={receipt.url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
            {receipt.label} <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <p className="mt-6 rounded-2xl border p-4 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
            No public receipt URL was reported for this payment. Store a Circle Gateway receipt URL when Circle returns one, or an Arc transaction hash for Arcscan receipts.
          </p>
        )}
      </div>
    </div>
  );
}

function getReceiptTarget(transaction: Transaction) {
  if (transaction.receiptUrl) return { url: transaction.receiptUrl, label: "Open Circle receipt" };
  if (transaction.chainExplorerUrl) return { url: transaction.chainExplorerUrl, label: "Open Arcscan receipt" };
  if ((transaction.network || "").toLowerCase().includes("arc") && transaction.txHash?.startsWith("0x")) {
    return { url: `https://testnet.arcscan.app/tx/${transaction.txHash}`, label: "Open Arcscan receipt" };
  }
  return null;
}

function displayPaymentRoute(transaction: Transaction) {
  if (transaction.paymentProvider === "circle-gateway") return "Circle Gateway";
  if (transaction.paymentProvider === "arc-testnet") return "Arc Testnet";
  return transaction.network || transaction.paymentProvider || "Recorded unlock";
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
      <div className="text-sm opacity-60">{label}</div>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  );
}

function EmptyEarnings() {
  return (
    <div className="rounded-[24px] border p-10 text-center shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white"><CreditCard /></div>
      <h3 className="mt-5 text-2xl font-medium">No earnings yet</h3>
      <p className="mx-auto mt-3 max-w-xl leading-7 opacity-70">
        Paid unlocks will appear here with revenue, receiving addresses, payment verification status, and package-reported payment ids.
      </p>
    </div>
  );
}

function deriveRevenueSeries(transactions: Transaction[], range: string) {
  const labels = rangeLabels(range);
  return labels.map((label, index) => {
    const bucket = transactions.filter((_, txIndex) => txIndex % labels.length === index);
    return {
      label,
      revenue: bucket.reduce((sum, transaction) => sum + transaction.amount, 0),
      unlocks: bucket.length,
    };
  });
}

function deriveSiteEarnings(transactions: Transaction[]): SiteEarning[] {
  const groups = new Map<string, Transaction[]>();
  transactions.forEach((transaction) => {
    const site = transaction.websiteName || "Unknown site";
    groups.set(site, [...(groups.get(site) || []), transaction]);
  });
  return Array.from(groups.entries()).map(([site, siteTransactions]) => {
    const revenue = siteTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    return {
      site,
      revenue,
      unlocks: siteTransactions.length,
      avgUnlock: siteTransactions.length ? revenue / siteTransactions.length : 0,
    };
  });
}

function deriveSiteReceivers(transactions: Transaction[]) {
  const groups = new Map<string, { site: string; address: string; network: string; revenue: number }>();
  transactions.forEach((transaction) => {
    const site = transaction.websiteName || "Unknown site";
    const existing = groups.get(site);
    groups.set(site, {
      site,
      address: transaction.recipient || existing?.address || "",
      network: transaction.network || displayPaymentRoute(transaction),
      revenue: (existing?.revenue || 0) + transaction.amount,
    });
  });
  return Array.from(groups.values()).filter((item) => item.address || item.revenue > 0);
}

function deriveRevenueByContent(transactions: Transaction[]) {
  const groups = new Map<string, { title: string; site: string; revenue: number; unlocks: number; recipient: string }>();
  transactions.forEach((transaction) => {
    const title = transaction.contentTitle || "Paid unlock";
    const site = transaction.websiteName || "Unknown site";
    const key = `${site}:${title}`;
    const existing = groups.get(key);
    groups.set(key, {
      title,
      site,
      revenue: (existing?.revenue || 0) + transaction.amount,
      unlocks: (existing?.unlocks || 0) + 1,
      recipient: transaction.recipient || existing?.recipient || "",
    });
  });
  return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue);
}

function rangeLabels(range: string) {
  if (range === "7D") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (range === "90D") return ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12"];
  if (range === "12M") return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return ["1", "5", "10", "15", "20", "25", "30"];
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

function normalizeFailureReasons(reasons: Array<{ label: string; value: number }>) {
  const total = reasons.reduce((sum, reason) => sum + Number(reason.value || 0), 0);
  if (!total) return [];
  return reasons.map((reason) => ({
    label: reason.label,
    value: Math.round((Number(reason.value || 0) / total) * 100)
  }));
}
