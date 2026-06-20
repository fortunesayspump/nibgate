import { categoryNav } from './category-nav.js';
import { createExploreRoutes } from '../routes.js';

export function exploreControls({ basePath = '/explore' } = {}) {
  const exploreRoutes = createExploreRoutes(basePath);

  return `<section class="explore-controls" aria-label="Explore filters">
    <div class="explore-controls-main">
      <form class="explore-search" action="${exploreRoutes.products}" method="get">
        <label for="explore-query">Search products</label>
        <svg class="explore-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="m18,10c0-4.41-3.59-8-8-8S2,5.59,2,10s3.59,8,8,8c1.85,0,3.54-.63,4.9-1.69l5.1,5.1,1.41-1.41-5.1-5.1c1.05-1.36,1.69-3.05,1.69-4.9Zm-14,0c0-3.31,2.69-6,6-6s6,2.69,6,6-2.69,6-6,6-6-2.69-6-6Z"/></svg>
        <input id="explore-query" name="q" placeholder="Search products" autocomplete="off" />
      </form>
    </div>
    ${categoryNav({ basePath })}
  </section>`;
}
