import Link from "next/link";

export default function HistoricalSortUnavailable() {
  return <section className="market-section"><h1>This sort is unavailable</h1><p className="explore-empty-state" role="status">Popularity and publication-date sorting are unavailable for this sample.</p><Link href="/explore/products" className="underline">Browse current public articles by site order</Link></section>;
}
