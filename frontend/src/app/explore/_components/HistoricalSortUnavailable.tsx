import Link from "next/link";

export default function HistoricalSortUnavailable() {
  return <section className="market-section"><h1>Activity-based sorting is unavailable</h1><p className="explore-empty-state" role="status">Trending and best-seller rankings require historical activity whose public visibility at the time cannot be established.</p><Link href="/explore/products" className="underline">Browse current public articles by newest publication</Link></section>;
}
