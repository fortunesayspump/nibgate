import { marketCard } from '../components/product-card.js';
import { contentTypes, marketProducts, sortTabs } from '../data/catalog.js';

export function marketSection() {
  return `<section class="market-section" aria-labelledby="market-title">
    <div class="market-heading">
      <h2 id="market-title">Explore content</h2>
      <div class="market-controls" aria-label="Explore content controls">
        <div class="sort-tabs" role="radiogroup" aria-label="Sort content">
          ${sortTabs.map((tab, index) => `<button class="${index === 0 ? 'active' : ''}" type="button" aria-pressed="${index === 0 ? 'true' : 'false'}">${tab}</button>`).join('')}
        </div>
        <div class="type-tabs" aria-label="Filter by content type">
          ${contentTypes.map((type) => `<button class="active" type="button" aria-pressed="true">${type}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="market-layout">
      <div class="market-products">
        <div class="market-grid">
          ${marketProducts.map(marketCard).join('')}
        </div>
        <div class="market-load-more">
          <button type="button">Load more</button>
        </div>
      </div>
    </div>
  </section>`;
}
