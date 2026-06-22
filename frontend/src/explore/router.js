import { categoriesPage } from './pages/categories.js';
import { creatorsPage } from './pages/creators.js';
import { exploreHomePage } from './pages/home.js';
import { productsPage } from './pages/products.js';
import { wishlistsPage } from './pages/wishlists.js';

export function exploreRouteContent(path, controlsHtml = '') {
  if (path === '/products') return controlsHtml + productsPage();
  if (path === '/categories') return controlsHtml + categoriesPage();
  if (path === '/wishlists') return controlsHtml + wishlistsPage();
  if (path === '/creators') return controlsHtml + creatorsPage();
  return exploreHomePage(controlsHtml);
}
