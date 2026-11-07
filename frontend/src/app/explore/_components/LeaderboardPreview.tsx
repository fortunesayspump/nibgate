import Link from "next/link";
import Image from "next/image";
import { apiUrl } from "@/lib/api";

type Creator = { id: string; rank: number; name: string; walletAddress?: string; avatarUrl?: string; reputationScore?: number | null; unlocks: number; contentCount: number };

async function getCreators() {
  try {
    const res = await fetch(apiUrl("/hub/reputation/leaderboards?type=creators&limit=3"), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success === false || !Array.isArray(data.items)) return null;
    return { items: data.items as Creator[], rankingScope: data.rankingScope };
  } catch {
    return null;
  }
}

export default async function LeaderboardPreview() {
  const result = await getCreators();
  const creators = result?.items;
  return (
    <section className="leaderboard-preview" aria-labelledby="leaderboard-preview-title">
      <div className="market-heading">
        <h2 id="leaderboard-preview-title">Creator leaderboard</h2>
        <Link href="/leaderboards">View all</Link>
      </div>
      {result?.rankingScope === "first-500-candidates" && <p>Rankings cover the first 500 eligible candidates, not the full network.</p>}
      <div className="leaderboard-preview-grid">
        {creators === undefined ? <p className="explore-empty-state" role="status">Creator rankings are unavailable. Please try again later.</p> : creators.length ? creators.map((creator) => (
          <article key={creator.id} className="leaderboard-preview-card">
            <div className="leaderboard-preview-card-top">
              <span className="leaderboard-preview-rank">#{creator.rank}</span>
              {creator.avatarUrl && <Image src={creator.avatarUrl} alt="" width={40} height={40} />}
            </div>
            <div>
              <h3>{creator.name}</h3>
              <p>{creator.contentCount} content · {creator.unlocks} unlocks</p>
            </div>
            <strong>{typeof creator.reputationScore === "number" ? `${creator.reputationScore}/100` : "No rep"}</strong>
          </article>
        )) : <p className="explore-empty-state">No creators ranked yet.</p>}
      </div>
    </section>
  );
}
