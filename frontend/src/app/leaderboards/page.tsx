import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LeaderboardTable from "./table";
import { apiUrl } from "@/lib/api";

type LeaderboardItem = Record<string, any> & { rank: number; reputationScore?: number | null };
type PlatformStats = { creators: number; sites: number; content: number; views: number; unlocks: number; revenue: number; nibshareViews?: number; nibshareUnlocks?: number };

async function getBoard(type: string) {
  try {
    const res = await fetch(apiUrl(`/hub/reputation/leaderboards?type=${type}&limit=50`), { next: { revalidate: 300 } });
    if (!res.ok) return { items: [] as LeaderboardItem[], total: 0, unavailable: true };
    const data = await res.json();
    return { items: (data.items || []) as LeaderboardItem[], total: data.total || 0, unavailable: false };
  } catch {
    return { items: [] as LeaderboardItem[], total: 0, unavailable: true };
  }
}

async function getStats() {
  try {
    const res = await fetch(apiUrl("/hub/stats"), { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.stats || null) as PlatformStats | null;
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
            {content.unavailable && <p className="mb-4 text-sm opacity-75">Content rankings are temporarily unavailable.</p>}
            {(creators.unavailable || sites.unavailable || !stats) && <p className="mb-4 text-sm opacity-75">Some rankings or statistics are temporarily unavailable.</p>}
            {stats && <LeaderboardTable creators={creators.items} sites={sites.items} content={content.items} totals={{ creators: stats.creators, sites: stats.sites, content: stats.content }} stats={{ views: stats.views + (stats.nibshareViews || 0), unlocks: stats.unlocks + (stats.nibshareUnlocks || 0), revenue: stats.revenue }} />}
          </div>
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}
