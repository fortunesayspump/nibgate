import { categoriesPage } from './pages/categories.js';
import { creatorsPage } from './pages/creators.js';
import { exploreHomePage } from './pages/home.js';
import { productsPage } from './pages/products.js';
import { wishlistsPage } from './pages/wishlists.js';

export function exploreRouteContent(path) {
  if (path === '/products') return productsPage();
  if (path === '/categories') return categoriesPage();
  if (path === '/wishlists') return wishlistsPage();
  if (path === '/creators') return creatorsPage();
  return exploreHomePage();
}
