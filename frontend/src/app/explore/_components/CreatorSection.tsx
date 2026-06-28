import Link from "next/link";
import { featuredProducts, marketProducts } from "../_data/catalog";

export default function CreatorSection() {
  const creators = Array.from(
    new Set([
      ...featuredProducts.map((product) => product.creator),
      ...marketProducts.map((product) => product.creator)
    ].filter((creator): creator is string => Boolean(creator)))
  ).slice(0, 12);

  return (
    <section className="explore-directory" aria-labelledby="creators-title">
      <h1 id="creators-title">Creators</h1>
      <div className="explore-directory-grid">
        {creators.map((creator: string) => (
          <Link key={creator} href="/explore/products">
            <span>{creator}</span>
            <strong>View content</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
