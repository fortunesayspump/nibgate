import { featuredProducts } from '../data/catalog.js';
import { featuredCard } from '../components/product-card.js';

export function featuredSection() {
  return `<section class="featured-section" aria-labelledby="featured-title">
    <header class="explore-section-heading">
      <h1 id="featured-title">Featured products</h1>
      <div class="explore-pager">
        <button type="button" aria-label="Previous featured product">&lt;</button>
        <span>1 / 8</span>
        <button type="button" aria-label="Next featured product">&gt;</button>
      </div>
    </header>
    <div class="featured-track">
      ${featuredProducts.map(featuredCard).join('')}
    </div>
  </section>`;
}
