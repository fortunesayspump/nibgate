// Local-only fixtures; no generated records are shipped to the application.
// Run with NODE_PATH pointing at installed sucrase/react/react-dom if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transform } = require('sucrase');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const app = path.join(__dirname, '../src/app');
function load(file, fetch) {
  const source = fs.readFileSync(path.join(app, file), 'utf8');
  const compiled = transform(source, { transforms: ['typescript', 'jsx', 'imports'], jsxRuntime: 'classic', production: true }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, React, URL, URLSearchParams, process, fetch, require: name => {
    if (name === '@/lib/api') return { apiUrl: path => `https://example.test${path}` };
    if (name === 'react') return React;
    if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    if (name === 'next/image') return ({ priority, ...props }) => React.createElement('img', props);
    if (name.startsWith('.')) {
      const target = path.join(path.dirname(file), name);
      const resolved = ['.tsx', '.ts'].map(ext => target + ext).find(candidate => fs.existsSync(path.join(app, candidate)));
      if (!resolved) throw new Error(`Unresolved local test import ${name} in ${file}`);
      return load(resolved, fetch);
    }
    return () => null; // Header/Footer are outside this unit's scope.
  }});
  return module.exports;
}
const ok = value => async () => ({ ok: true, json: async () => value });
const failure = async () => { throw new Error('offline'); };
const unavailable = async () => ({ ok: false, status: 503, json: async () => ({ code: 'event-visibility-unavailable' }) });
const response = content => ({ success: true, scope: 'current-public-creator-articles', sort: 'newest-publication', historyStatus: 'unavailable-no-event-visibility-proof', content });
const fixture = { id: 'test', identityScope: 'creator-publication', title: 'Local test article', description: 'Test description', url: 'https://example.test/article', tags: '', contentType: 'article', price: 0.005, currency: 'USDC', views: null, unlocks: null, revenue: null, ratings: null, reputationScore: null, reputationStars: null };
(async () => {
  const discovery = 'explore/_data/explore-content.ts';
  assert.equal(await load(discovery, failure).getExploreProducts(), null);
  assert.equal(await load(discovery, unavailable).getExploreProducts(), null);
  await load(discovery, async (url, options) => {
    assert.equal(options.cache, 'no-store'); assert.match(url, /sort=newest-publication/);
    return { ok: true, json: async () => response([]) };
  }).getExploreProducts();
  assert.equal(await load(discovery, ok({})).getExploreProducts(), null);
  assert.equal(await load(discovery, ok({ content: [fixture] })).getExploreProducts(), null);
  assert.equal(await load(discovery, ok({ ...response([fixture]), scope: 'verified-indexed-content' })).getExploreProducts(), null);
  assert.equal((await load(discovery, ok(response([]))).getExploreProducts()).length, 0);
  assert.equal(await load(discovery, ok(response([null]))).getExploreProducts(), null);
  assert.equal(await load(discovery, ok({ ...response([fixture]), sort: 'trending' })).getExploreProducts(), null);
  const product = (await load(discovery, ok(response([fixture]))).getExploreProducts())[0];
  assert.equal(product.image, ''); assert.equal(product.avatar, ''); assert.equal(product.price, '0.005 USDC');
  for (const field of ['unlocks', 'unlockCount', 'views', 'revenue', 'ratings', 'reputationScore', 'reputationStars']) assert.equal(product[field], null);
  const legacyProduct = load(discovery, failure).toExploreProduct({ ...fixture, unlocks: 100, views: 400, revenue: 12, ratings: 5, reputationScore: 90 });
  for (const field of ['unlockCount', 'views', 'revenue', 'ratings', 'reputationScore']) assert.equal(legacyProduct[field], null);
  assert.equal(load(discovery, failure).toExploreProduct({ ...fixture, price: undefined }).price, 'Price unavailable');
  assert.equal(await load(discovery, () => { throw new Error('Unsupported sort must not fetch'); }).getExploreProducts({ sort: 'trending' }), null);
  const cards = load('explore/_components/ProductCard.tsx', failure);
  for (const name of ['ArticleCard', 'FeaturedCard', 'MarketCard']) {
    const markup = renderToStaticMarkup(React.createElement(cards[name], { product }));
    assert.match(markup, /Local test article/);
    assert.doesNotMatch(markup, /0 unlocks|Unrated|No rep|Verified rep|dicebear|<img/);
  }
  const sourceImage = load(discovery, failure).toExploreProduct({ ...fixture, imageUrl: 'https://example.test/source.jpg' });
  assert.match(renderToStaticMarkup(React.createElement(cards.MarketCard, { product: sourceImage })), /https:\/\/example.test\/source.jpg/);
  const market = load('explore/_components/MarketSection.tsx', failure).default;
  const markup = renderToStaticMarkup(React.createElement(market, { products: [product] }));
  assert.match(markup, /latest 20 listings per eligible hosted site/);
  assert.match(markup, /Trending \(unavailable\)/); assert.match(markup, /Best Sellers \(unavailable\)/);
  assert.match(markup, /disabled=""/); assert.doesNotMatch(markup, /0 unlocks|Unrated|No rep/);
  assert.match(renderToStaticMarkup(React.createElement(market, { products: [] })), /No matching articles were found in the current public listing sample/);
  for (const route of ['ledger/page.tsx', 'leaderboards/page.tsx', 'explore/_components/LeaderboardPreview.tsx', 'leaderboards/table.tsx']) {
    for (const fetch of [failure, unavailable, ok({ items: [fixture], activities: [fixture], totals: { views: 10 } })]) {
      const rendered = renderToStaticMarkup(await load(route, fetch).default({}));
      assert.match(rendered, /unavailable/);
      assert.match(rendered, /public.*(?:when|time)/);
      assert.doesNotMatch(rendered, /Local test article|No ranked entries|No public activity|Load more|Next page|<table/);
    }
  }
  const historicalPage = load('explore/products/page.tsx', failure).default;
  for (const sort of ['trending', 'best-sellers']) {
    const rendered = renderToStaticMarkup(await historicalPage({ searchParams: Promise.resolve({ sort }) }));
    assert.match(rendered, /Activity-based sorting is unavailable/);
  }
  console.log('Public-feed v2 checks passed: source contract, failure/empty, null metrics, prices/images, sampled scope, unavailable sorting and fail-closed historical surfaces.');
})().catch(error => { console.error(error); process.exitCode = 1; });
