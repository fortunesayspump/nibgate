import Link from "next/link";

export default function LeaderboardPreview() {
  return (
    <section className="leaderboard-preview" aria-labelledby="leaderboard-preview-title">
      <div className="market-heading"><h2 id="leaderboard-preview-title">Creator leaderboard</h2><Link href="/leaderboards">About rankings</Link></div>
      <p className="explore-empty-state" role="status">Historical rankings are unavailable because we cannot establish whether content was public when the activity and ratings occurred.</p>
    </section>
  );
}
