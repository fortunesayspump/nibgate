import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LeaderboardTable from "./table";
import { apiUrl } from "@/lib/api";

type LeaderboardItem = Record<string, any> & { rank: number; reputationScore?: number };

async function getBoard(type: string) {
  try {
    const res = await fetch(apiUrl(`/api/hub/reputation/leaderboards?type=${type}&limit=50`), { cache: "no-store" });
    if (!res.ok) return [] as LeaderboardItem[];
    const data = await res.json();
    return (data.items || []) as LeaderboardItem[];
  } catch {
    return [] as LeaderboardItem[];
  }
}

export default async function LeaderboardsPage() {
  const [creators, sites, content] = await Promise.all([getBoard("creators"), getBoard("sites"), getBoard("content")]);

  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xl font-medium">Leaderboards</p>
              <h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Reputation rankings.</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 opacity-75">Switch between creators, verified sites, and content. Content earns stars first; site and creator scores roll up from verified activity.</p>
            </div>
          </div>

          <LeaderboardTable creators={creators} sites={sites} content={content} />
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}
