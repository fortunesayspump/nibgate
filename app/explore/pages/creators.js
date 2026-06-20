import { escapeHtml } from 'nibgate/src/shared/html.js';
import { featuredProducts, marketProducts } from '../data/catalog.js';
import { exploreRoutes } from '../routes.js';

export function creatorsPage() {
  const creators = [...new Set([...featuredProducts.map((product) => product.creator), ...marketProducts.map((product) => product[1])])].slice(0, 12);

  return `<section class="explore-directory" aria-labelledby="creators-title">
    <h1 id="creators-title">Creators</h1>
    <div class="explore-directory-grid">
      ${creators.map((creator) => `<a href="${exploreRoutes.products}"><span>${escapeHtml(creator)}</span><strong>View products</strong></a>`).join('')}
    </div>
  </section>`;
}
