import { escapeHtml } from '../../../packages/cli/src/shared/html.js';
import { categories } from '../data/catalog.js';
import { exploreRoutes } from '../routes.js';

function categoryLink([label, ...items]) {
  const isActive = label === 'All';
  const moreChevron = label === 'More'
    ? '<svg class="explore-category-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="m12 15.41 5.71-5.7-1.42-1.42-4.29 4.3-4.29-4.3-1.42 1.42z"/></svg>'
    : '';
  const labelText = `${escapeHtml(label)}${moreChevron}`;
  const menu = items.length
    ? `<div class="explore-category-menu" role="menu" aria-label="${escapeHtml(label)}">
      ${items.map((item, index) => `<a href="${exploreRoutes.categories}" role="menuitem">${escapeHtml(item)}${index > 0 && index < items.length - 1 ? '<span>›</span>' : ''}</a>`).join('')}
    </div>`
    : '';

  return `<div class="explore-category-wrap">
    <a class="explore-category ${isActive ? 'active' : ''}" href="${isActive ? exploreRoutes.home : exploreRoutes.categories}" role="menuitem" aria-haspopup="${items.length ? 'menu' : 'false'}"${items.length ? ' aria-expanded="false"' : ''}>${labelText}</a>
    ${menu}
  </div>`;
}

export function categoryNav() {
  return `<nav class="explore-categories" aria-label="Explore categories" role="menubar">
    ${categories.map(categoryLink).join('')}
  </nav>`;
}
