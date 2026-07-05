import Link from "next/link";
import { apiUrl } from "@/lib/api";

type Creator = { id: string; rank: number; name: string; walletAddress?: string; avatarUrl?: string; reputationScore?: number | null; unlocks: number; contentCount: number };

function creatorAvatar(creator: Creator) {
  return creator.avatarUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(creator.name || creator.walletAddress || "Creator")}`;
}

async function getCreators() {
  try {
    const res = await fetch(apiUrl("/api/hub/reputation/leaderboards?type=creators&limit=3"), { cache: "no-store" });
    if (!res.ok) return [] as Creator[];
    const data = await res.json();
    return (data.items || []) as Creator[];
  } catch {
    return [] as Creator[];
  }
}

export default async function LeaderboardPreview() {
  const creators = await getCreators();
  return (
    <section className="leaderboard-preview" aria-labelledby="leaderboard-preview-title">
      <div className="market-heading">
        <h2 id="leaderboard-preview-title">Creator leaderboard</h2>
        <Link href="/leaderboards">View all</Link>
      </div>
      <div className="leaderboard-preview-grid">
        {creators.length ? creators.map((creator) => (
          <article key={creator.id} className="leaderboard-preview-card">
            <div className="leaderboard-preview-card-top">
              <span className="leaderboard-preview-rank">#{creator.rank}</span>
              <img src={creatorAvatar(creator)} alt="" loading="lazy" />
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
