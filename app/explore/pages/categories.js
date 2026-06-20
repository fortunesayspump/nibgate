import { escapeHtml } from '../../../packages/cli/src/shared/html.js';
import { categories } from '../data/catalog.js';
import { exploreRoutes } from '../routes.js';

export function categoriesPage() {
  return `<section class="explore-directory" aria-labelledby="categories-title">
    <h1 id="categories-title">Categories</h1>
    <div class="explore-directory-grid">
      ${categories
        .map(([category]) => category)
        .filter((category) => category !== 'All')
        .map((category) => `<a href="${exploreRoutes.products}"><span>${escapeHtml(category)}</span><strong>Explore</strong></a>`)
        .join('')}
    </div>
  </section>`;
}
