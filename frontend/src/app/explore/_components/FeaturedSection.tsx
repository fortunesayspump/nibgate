import { featuredProducts } from "../_data/catalog";
import { FeaturedCard } from "./ProductCard";

export default function FeaturedSection() {
  return (
    <section className="featured-section" aria-labelledby="featured-title">
      <header className="explore-section-heading">
        <h1 id="featured-title">Featured content</h1>
        <div className="explore-pager">
          <button type="button" aria-label="Previous featured product">&lt;</button>
          <span>1 / 8</span>
          <button type="button" aria-label="Next featured product">&gt;</button>
        </div>
      </header>
      <div className="featured-track">
        {featuredProducts.map((product: any, i: number) => (
          <FeaturedCard key={i} product={product} />
        ))}
      </div>
    </section>
  );
}
