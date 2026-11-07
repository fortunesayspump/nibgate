import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LeaderboardTable from "./table";
import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

type LeaderboardItem = Record<string, any> & { rank: number; reputationScore?: number | null };
type PlatformStats = { creators: number; sites: number; content: number; views: number; unlocks: number; revenue: number };

async function getBoard(type: string) {
  try {
    const res = await fetch(apiUrl(`/hub/reputation/leaderboards?type=${type}&limit=50`), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success === false || !Array.isArray(data.items) || !Number.isFinite(data.total)) return null;
    return { items: data.items as LeaderboardItem[], total: data.total as number, rankingScope: data.rankingScope as string | undefined };
  } catch {
    return null;
  }
}

async function getStats() {
  try {
    const res = await fetch(apiUrl("/hub/stats"), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success === false || !data.stats || !["creators", "sites", "content", "views", "unlocks", "revenue"].every(key => Number.isFinite(data.stats[key]))) return null;
    return data.stats as PlatformStats;
  } catch {
    return null;
  }
}

export default async function LeaderboardsPage() {
  const [creators, sites, content, stats] = await Promise.all([getBoard("creators"), getBoard("sites"), getBoard("content"), getStats()]);

  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xl font-medium">Leaderboards</p>
              <h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Reputation rankings.</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 opacity-75">Switch between creators, verified sites, and content. Reputation appears after accepted content ratings; views and unlocks stay as activity signals.</p>
            </div>
          </div>

          <div className="mt-10">
            <LeaderboardTable creators={creators?.items ?? []} sites={sites?.items ?? []} content={content?.items ?? []}
              unavailable={{ creators: creators === null, sites: sites === null, content: content === null }}
              boardTotals={{ creators: creators?.total, sites: sites?.total, content: content?.total }}
              scopes={{ creators: creators?.rankingScope, sites: sites?.rankingScope, content: content?.rankingScope }}
              totals={stats ? { creators: stats.creators, sites: stats.sites, content: stats.content } : undefined}
              stats={stats ? { views: stats.views, unlocks: stats.unlocks, revenue: stats.revenue } : undefined} />
          </div>
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}
