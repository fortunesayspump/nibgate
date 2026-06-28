import { featuredProducts } from "../_data/catalog";
import { FeaturedCard } from "./ProductCard";

export default function FeaturedSection() {
  if (featuredProducts.length === 0) {
    return (
      <section className="featured-section" aria-labelledby="featured-title">
        <header className="explore-section-heading">
          <h1 id="featured-title">Featured content</h1>
        </header>
        <div className="rounded-[8px] border border-black/10 p-8 text-center">
          <p>No featured content has been synced yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="featured-section" aria-labelledby="featured-title">
      <header className="explore-section-heading">
        <h1 id="featured-title">Featured content</h1>
        <div className="explore-pager">
          <button type="button" aria-label="Previous featured product">&lt;</button>
          <span>1 / {featuredProducts.length}</span>
          <button type="button" aria-label="Next featured product">&gt;</button>
        </div>
      </header>
      <div className="featured-track">
        {featuredProducts.map((product, i) => (
          <FeaturedCard key={i} product={product} />
        ))}
      </div>
    </section>
  );
}
