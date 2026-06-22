const trimTrailingSlash = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export function createExploreRoutes(basePath = '/explore') {
  const base = trimTrailingSlash(basePath || '');
  const route = (path = '') => `${base}${path}` || '/';

  return {
    home: route(''),
    products: route('/products'),
    categories: route('/categories'),
    wishlists: route('/wishlists'),
    creators: route('/creators'),
    signin: '/signin',
    connectSite: '/get-started'
  };
}

export const exploreRoutes = createExploreRoutes();
