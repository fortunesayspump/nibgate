// Local-only unit fixtures. No generated records are shipped to the application.
// Run with NODE_PATH pointing at installed sucrase/react/react-dom if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transform } = require('sucrase');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const app = path.join(__dirname, '../src/app');
function load(file, fetch, exports = '') {
  const source = fs.readFileSync(path.join(app, file), 'utf8') + exports;
  const compiled = transform(source, { transforms: ['typescript', 'jsx', 'imports'], jsxRuntime: 'classic', production: true }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, React, URL, URLSearchParams, process, fetch, require: name => {
    if (name === '@/lib/api') return { apiUrl: path => `https://example.test${path}` };
    if (name === 'react') return React;
    if (name === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    return () => null;
  }});
  return module.exports;
}
const ok = value => async () => ({ ok: true, json: async () => value });
const failure = async () => { throw new Error('offline'); };
(async () => {
  for (const file of ['explore/_components/MarketSection.tsx', 'explore/_components/ProductCard.tsx', 'leaderboards/table.tsx']) load(file, failure);
  const discovery = 'explore/_data/explore-content.ts';
  assert.equal(await load(discovery, failure).getExploreProducts(), null);
  await load(discovery, async (_url, options) => { assert.equal(options.cache, 'no-store'); return { ok: true, json: async () => ({ content: [] }) }; }).getExploreProducts();
  assert.equal(await load(discovery, ok({})).getExploreProducts(), null);
  assert.equal((await load(discovery, ok({ content: [] })).getExploreProducts()).length, 0);
  const product = load(discovery, failure).toExploreProduct({ id: 'test', title: 'Test', tags: '', contentType: 'article' });
  assert.equal(product.image, ''); assert.equal(product.avatar, '');
  const board = 'leaderboards/page.tsx';
  const exported = '\nexport { getBoard, getStats };';
  assert.equal(await load(board, failure, exported).getBoard('creators'), null);
  assert.equal(await load(board, failure, exported).getStats(), null);
  assert.equal(await load(board, ok({ stats: {} }), exported).getStats(), null);
  assert.equal((await load(board, ok({ items: [], total: 0 }), exported).getBoard('creators')).items.length, 0);
  assert.equal((await load(board, ok({ items: [], total: 500, rankingScope: 'first-500-candidates' }), exported).getBoard('creators')).rankingScope, 'first-500-candidates');
  const table = load('leaderboards/table.tsx', failure).default;
  const tableProps = { creators: [], sites: [], content: [], unavailable: { creators: true, sites: false, content: false }, boardTotals: {}, scopes: { creators: 'first-500-candidates' } };
  const tableMarkup = renderToStaticMarkup(React.createElement(table, tableProps));
  assert.match(tableMarkup, /Rankings are unavailable/);
  assert.match(tableMarkup, /first 500 eligible candidates/);
  assert.match(tableMarkup, /Unavailable/);
  assert.doesNotMatch(tableMarkup, /No ranked entries yet|Load more/);
  assert.match(renderToStaticMarkup(React.createElement(table, { ...tableProps, unavailable: {} })), /No ranked entries yet/);
  const ledger = 'ledger/page.tsx';
  const empty = { success: true, activities: [], totals: { views: 0, unlocks: 0, payments: 0, ratings: 0, tips: 0, total: 0 }, hasMore: false, limit: 50, skip: 0 };
  async function ledgerMarkup(fetch) { return renderToStaticMarkup(await load(ledger, fetch).default({})); }
  assert.match(await ledgerMarkup(failure), /activity feed is unavailable/);
  assert.doesNotMatch(await ledgerMarkup(failure), /No public activity has been recorded/);
  assert.match(await ledgerMarkup(ok(empty)), /No public activity has been recorded/);
  const capped = await ledgerMarkup(ok({ ...empty, skip: 10000, paginationLimitReached: true }));
  assert.match(capped, /outside the current feed window/);
  assert.doesNotMatch(capped, /Next page/);
  assert.match(await ledgerMarkup(ok({ ...empty, activities: [{ id: 'private', type: 'nibshare_view' }] })), /activity feed is unavailable/);
  const row = { id: 'local-test', type: 'view', contentTitle: 'Test public content', contentUrl: 'javascript:alert(1)', timestamp: '2026-01-01T00:00:00Z', actor: 'DO_NOT_RENDER_ACTOR', referrer: 'DO_NOT_RENDER_REFERRER' };
  const rendered = await ledgerMarkup(ok({ ...empty, activities: [row], hasMore: true }));
  assert.match(rendered, /Test public content/); assert.match(rendered, /skip=50/);
  assert.doesNotMatch(rendered, /javascript:|DO_NOT_RENDER_ACTOR|DO_NOT_RENDER_REFERRER/);
  console.log('Public feed unit checks passed (Explore failure/empty/images, rankings failure/scope/stats, Ledger failure/empty/privacy/pagination).');
})().catch(error => { console.error(error); process.exitCode = 1; });
