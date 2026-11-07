import Link from "next/link";
import type { ExploreProduct } from "../_data/catalog";

export default function CreatorSection({ products }: { products: ExploreProduct[] }) {
  const creators = Array.from(
    new Set(products.map((product) => product.creator).filter((creator): creator is string => Boolean(creator)))
  ).slice(0, 12);

  return (
    <section className="explore-directory" aria-labelledby="creators-title">
      <h1 id="creators-title">Creators</h1>
      <p>Creators represented in the current public article sample, limited to 20 listings per eligible hosted site among at most 20 verified hosted sites checked. Some sites may be temporarily unavailable and omitted. This is not a complete creator directory.</p>
      <div className="explore-directory-grid">
        {creators.length === 0 ? (
          <p className="rounded-[8px] border border-black/10 p-8 text-center">No creators were found in this current public listing sample.</p>
        ) : creators.map((creator: string) => (
          <Link key={creator} href="/explore/products">
            <span>{creator}</span>
            <strong>View content</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
