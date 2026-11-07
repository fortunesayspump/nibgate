import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

const eventLabels = { view: "View", unlock: "Unlock", payment: "Payment", rating: "Rating", tip: "Tip" };
type Activity = {
  id: string;
  type: keyof typeof eventLabels;
  contentTitle?: string;
  contentUrl?: string;
  domain?: string;
  timestamp: string;
  amount?: number;
  currency?: string;
  score?: number;
  status?: string;
};
type Ledger = {
  activities: Activity[];
  totals: { views: number; unlocks: number; payments: number; ratings: number; tips: number; total: number };
  hasMore: boolean;
  paginationLimitReached?: boolean;
  limit: number;
  skip: number;
};

function publicUrl(value?: string) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

async function getLedger(skip: number): Promise<Ledger | null> {
  try {
    const response = await fetch(apiUrl(`/hub/ledger?limit=50&skip=${skip}`), { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.success !== true || !Array.isArray(data.activities) || !data.totals
      || !["views", "unlocks", "payments", "ratings", "tips", "total"].every(key => Number.isFinite(data.totals[key]))
      || typeof data.hasMore !== "boolean" || !Number.isInteger(data.limit) || data.limit <= 0 || !Number.isInteger(data.skip)) return null;
    // Render only the explicit public event types and fields; never actor IDs,
    // referrers, wallet identifiers or private content from a changed response.
    if (!data.activities.every((event: Activity) => Object.hasOwn(eventLabels, event.type))) return null;
    return data as Ledger;
  } catch { return null; }
}

function detail(event: Activity) {
  if (event.type === "rating") return typeof event.score === "number" ? `Score: ${event.score}` : "Rating recorded";
  const amount = event.amount;
  if (typeof amount === "number" && Number.isFinite(amount)) return `${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${event.currency || ""}${event.status ? ` · ${event.status}` : ""}`;
  return event.status || "—";
}

export default async function LedgerPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedSkip = typeof params?.skip === "string" ? Number(params.skip) : 0;
  const skip = Number.isSafeInteger(requestedSkip) && requestedSkip >= 0 ? requestedSkip : 0;
  const ledger = await getLedger(skip);
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-7xl">
          <p className="text-xl font-medium">Ledger</p>
          <h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Network activity.</h1>
          <p className="mt-6 max-w-3xl text-xl leading-8 opacity-75">Public activity for indexed content on verified sites. Nibshare activity is excluded. Unlock and payment totals count the same verified receipts; each receipt appears once in this feed.</p>
          {ledger === null ? <p role="status" className="mt-10 border border-dark-gray/50 bg-white p-6">The activity feed is unavailable. Please reload this page to try again.</p> : <>
            <dl className="mt-10 flex flex-wrap gap-6 border-y border-dark-gray/50 py-5">
              {([['Views', ledger.totals.views], ['Unlocks', ledger.totals.unlocks], ['Payments', ledger.totals.payments], ['Ratings', ledger.totals.ratings], ['Public tips', ledger.totals.tips]] as const).map(([label, value]) => <div key={label}><dt className="text-sm opacity-65">{label}</dt><dd className="mt-1 text-xl">{value.toLocaleString("en-US")}</dd></div>)}
            </dl>
            <div className="mt-6 overflow-x-auto border border-dark-gray/50 bg-white">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">Recent public network activity. Times are shown in UTC.</caption>
                <thead className="border-b border-dark-gray/50 bg-gray"><tr>{['Event', 'Content', 'Details', 'Time (UTC)'].map(label => <th key={label} scope="col" className="px-5 py-4 font-medium">{label}</th>)}</tr></thead>
                <tbody>{ledger.activities.length === 0 ? <tr><td colSpan={4} className="px-5 py-12 text-center">{skip ? "No more public activity on this page." : "No public activity has been recorded yet."}</td></tr> : ledger.activities.map(event => {
                  const href = publicUrl(event.contentUrl);
                  const date = new Date(event.timestamp);
                  return <tr key={`${event.type}-${event.id}`} className="border-b border-dark-gray/40">
                    <td className="px-5 py-5">{eventLabels[event.type]}</td>
                    <td className="px-5 py-5">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{event.contentTitle || event.domain || 'Public content'}</a> : <span>{event.contentTitle || 'Public content'}</span>}{event.domain && <p className="mt-1 text-sm opacity-65">{event.domain}</p>}</td>
                    <td className="px-5 py-5">{detail(event)}</td>
                    <td className="px-5 py-5">{Number.isNaN(date.getTime()) ? "Unavailable" : <time dateTime={date.toISOString()}>{date.toISOString().replace('T', ' ').slice(0, 19)}</time>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {ledger.paginationLimitReached && <p role="status" className="mt-6">Older activity is outside the current feed window.</p>}
            <nav aria-label="Activity pages" className="mt-6 flex gap-6">
              {skip > 0 && <Link className="underline" href={`/ledger?skip=${Math.max(0, ledger.skip - ledger.limit)}`}>Previous page</Link>}
              {ledger.hasMore && <Link className="underline" href={`/ledger?skip=${ledger.skip + ledger.limit}`}>Next page</Link>}
            </nav>
          </>}
        </section>
      </main>
      <Footer />
    </div>
  );
}
