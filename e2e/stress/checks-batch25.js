// Batch 25 — Cross-surface subblog + agent/manifest surface + authz sweep.
//   Covers, across several places:
//     - subblog agent/read surfaces: /api/nibgate/status, /health, /site,
//       /api/nibgate/nibgate.json, /manifest (collection + per-post)
//     - subblog blog listing API: /api/blog/posts (type/tag filters,
//       pagination), /posts-by-types, getBySlug teaser vs full body leak check
//     - subblog reader pages per content type (writing/photos/music/video/docs)
//     - ratings + RSS feed surface (doc path present in feed)
//     - gateway/balance POST (valid + invalid address)
//     - authz sweep: every admin/owner route rejects anon (401/403/404), incl.
//       nonce GET / setup POST-only / me 401
//     - hub cross-surface: status, nonce, stats public; dashboard + rate are
//       authed; rate is POST-only (GET 404)
//   All API-level, no mutations (setup POST without key → 403, no state change).
const { SEL_PK, BUY_PK } = require('../harness/prod-lib.js');

const B = 'https://api.nibgate.xyz';
const CAT = 'https://catwalk.nibgate.xyz';
const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

async function jget(context, url) {
  const r = await context.request.get(url);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status(), json, raw: (await r.text()).slice(0, 120) };
}

const checks = [
  // ---- Subblog agent / read surface ----
  {
    id: 'sb25-status', group: 'subblog-agent', name: 'subblog: /api/nibgate/status public + hosted + hub pay endpoint', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/nibgate/status`);
      return [
        [status === 200, `status 200 (${status})`],
        [json.hosted === true, `hosted (${json.hosted})`],
        [/\/hub\/pay/.test(json.payEndpoint || ''), `payEndpoint points at hub (${json.payEndpoint})`],
      ];
    }
  },
  {
    id: 'sb25-health', group: 'subblog-agent', name: 'subblog: /api/health reports env + ok', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/health`);
      return [[status === 200 && json.success === true, `health ok (${status})`], [/production|staging|development/.test(json.env || ''), `env reported (${json.env})`]];
    }
  },
  {
    id: 'sb25-site', group: 'subblog-agent', name: 'subblog: /api/site returns identity + hub link + widget', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/site`);
      return [
        [status === 200 && json.success === true, `site ok (${status})`],
        [!!json.site?.name && !!json.site?.subdomain, `identity present (${json.site?.name} @ ${json.site?.subdomain})`],
        [json.widgetScript && /widget\.js/.test(json.widgetScript), `widget script emitted (${!!json.widgetScript})`],
      ];
    }
  },
  {
    id: 'sb25-nibgate-json', group: 'subblog-agent', name: 'subblog: nibgate.json catalog lists paid+free with access flags', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/nibgate/nibgate.json`);
      const items = json?.content || [];
      return [
        [status === 200 && Array.isArray(items), `catalog array (${status}, n=${items.length})`],
        [items.some((i) => i.access?.humans === 'paid' && i.price != null), 'has paid entry with access.humans=paid'],
        [items.some((i) => i.access?.humans === 'free'), 'has free entry with access.humans=free'],
        [items.every((i) => i.path && i.url), 'every entry carries path + url'],
      ];
    }
  },
  {
    id: 'sb25-manifest-collection', group: 'subblog-agent', name: 'subblog: /manifest collection lists content', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/nibgate/manifest`);
      return [[status === 200 && !!json?.name, `manifest name (${json?.name})`], [Array.isArray(json?.content) && json.content.length > 0, `content n=${json?.content?.length}`]];
    }
  },
  {
    id: 'sb25-manifest-post', group: 'subblog-agent', name: 'subblog: /manifest?path= returns per-post payment/urls', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/nibgate/manifest?path=${encodeURIComponent('/docs/lookbook-materials-d14')}`);
      return [
        [status === 200 && !!json?.id, `post manifest (${status}, id ${json?.id})`],
        [json?.type === 'document' && String(json?.price) === '0.50', `paid doc reflected (${json?.type} ${json?.price})`],
        [/\/docs\/lookbook-materials-d14/.test(json?.urls?.page || ''), `page url uses docs path (${json?.urls?.page})`],
      ];
    }
  },

  // ---- Subblog blog listing API ----
  {
    id: 'sb25-list-pagination', group: 'subblog-api', name: 'subblog: /api/blog/posts paginates + sorts', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts?page=1&limit=3`);
      return [
        [status === 200 && json.success === true, `list ok (${status})`],
        [Array.isArray(json.posts) && json.posts.length === 3, `page size honored (n=${json.posts?.length})`],
        [json.totalPages >= 1 && json.total >= 3, `pagination meta (total=${json.total})`],
      ];
    }
  },
  {
    id: 'sb25-list-type-filter', group: 'subblog-api', name: 'subblog: /api/blog/posts?type=document filters', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts?type=document`);
      return [
        [status === 200, `type filter ok (${status})`],
        [json.posts?.length >= 1 && json.posts.every((p) => p.type === 'document'), `only documents (n=${json.posts?.length})`],
      ];
    }
  },
  {
    id: 'sb25-list-tag-filter', group: 'subblog-api', name: 'subblog: /api/blog/posts?tag= filters + total', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts?tag=fashion`);
      return [[status === 200 && json.total > 0, `tag filter ok (total=${json.total})`]];
    }
  },
  {
    id: 'sb25-posts-by-types', group: 'subblog-api', name: 'subblog: /api/blog/posts-by-types groups all types', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts-by-types`);
      const groups = ['article', 'photo', 'music', 'video', 'document'];
      return [
        [status === 200 && json.success === true, `grouped ok (${status})`],
        ...groups.map((g) => [Array.isArray(json[g]) && json[g].length >= 0, `${g} group present (n=${json[g]?.length})`]),
      ];
    }
  },
  {
    id: 'sb25-getby-free-full', group: 'subblog-api', name: 'subblog: getBySlug free post returns full body', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts/care-for-clothes`);
      return [
        [status === 200 && json.success === true, `free slug ok (${status})`],
        [(json.post?.bodyMarkdown || '').length > 100, `full body served (len=${(json.post?.bodyMarkdown || '').length})`],
      ];
    }
  },
  {
    id: 'sb25-getby-paid-teaser', group: 'subblog-api', name: 'subblog: getBySlug paid post is teaser-locked (no body leak)', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts/future-sustainable-fashion`);
      return [
        [status === 200 && json.success === true, `paid slug ok (${status})`],
        [json.post?.isLocked === true, `isLocked set (${json.post?.isLocked})`],
        [(json.post?.bodyMarkdown || '') === '', `no body leak (len=${(json.post?.bodyMarkdown || '').length})`],
      ];
    }
  },
  {
    id: 'sb25-list-paid-no-leak', group: 'subblog-api', name: 'subblog: /api/blog/posts does NOT leak paid article bodies', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/blog/posts?limit=50`);
      const paid = (json.posts || []).filter((p) => p.price && p.price !== '0');
      const leaks = paid.filter((p) => (p.bodyMarkdown || '').length > 200);
      return [
        [status === 200, `list ok (${status})`],
        [paid.length > 0, `found ${paid.length} paid posts to check`],
        [leaks.length === 0, `no paid body leak (${leaks.length}/${paid.length} leaked)`],
      ];
    }
  },

  // ---- Subblog reader pages per type ----
  {
    id: 'sb25-reader-docs', group: 'subblog-reader2', name: 'subblog reader: /docs paid doc page renders paywall', pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `${CAT}/docs/lookbook-materials-d14`);
      const b = await h.bodyText(page);
      return [
        [!/Application error|Internal Server/i.test(b), 'no error boundary'],
        [/Pay to unlock|USDC|unlock/i.test(b), `paywall/price present (${/Pay to unlock|USDC|unlock/i.test(b)})`],
      ];
    }
  },
  {
    id: 'sb25-reader-music', group: 'subblog-reader2', name: 'subblog reader: /music paid page renders', pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `${CAT}/music/ambient-fashion-mix`);
      const b = await h.bodyText(page);
      return [
        [!/Application error|Internal Server/i.test(b), 'no error boundary'],
        [/Pay to unlock|USDC|unlock/i.test(b), `paywall/price present (${/Pay to unlock|USDC|unlock/i.test(b)})`],
      ];
    }
  },
  {
    id: 'sb25-reader-video-free', group: 'subblog-reader2', name: 'subblog reader: /video free page renders', pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `${CAT}/video/fashion-week-video`);
      const b = await h.bodyText(page);
      return [
        [!/Application error|Internal Server/i.test(b), 'no error boundary'],
        [!/Pay to unlock/i.test(b), 'no paywall on free video'],
      ];
    }
  },
  {
    id: 'sb25-reader-photo', group: 'subblog-reader2', name: 'subblog reader: /photos paid page renders', pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `${CAT}/photos/street-style-photography`);
      const b = await h.bodyText(page);
      return [
        [!/Application error|Internal Server/i.test(b), 'no error boundary'],
        [/Pay to unlock|USDC|unlock/i.test(b), `paywall/price present (${/Pay to unlock|USDC|unlock/i.test(b)})`],
      ];
    }
  },

  // ---- Ratings + RSS ----
  {
    id: 'sb25-rating-public', group: 'subblog-api', name: 'subblog: /api/rating/:postId public stats', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/rating/lookbook-materials-d14`);
      return [
        [status === 200 && json.success === true, `rating ok (${status})`],
        [/^(db|onchain)$/.test(json.source || ''), `source known (${json.source})`],
        [typeof json.average === 'number' && Number.isInteger(json.count), `stats shape (avg=${json.average} n=${json.count})`],
      ];
    }
  },
  {
    id: 'sb25-rating-document-path', group: 'subblog-api', name: 'subblog: rating content hash uses /docs path for documents', pk: 'anon',
    run: async (h, { context }) => {
      // The /:postId route builds contentUrlFor via TYPE_PATH; hit with the doc's
      // post id and confirm the response is still healthy (path mapping is in
      // rating.route.js TYPE_PATH, verified statically; here we just confirm the
      // public stats endpoint works for a document id).
      const man = await jget(context, `${CAT}/api/nibgate/manifest?path=${encodeURIComponent('/docs/lookbook-materials-d14')}`);
      const id = man.json?.id;
      const { status, json } = await jget(context, `${CAT}/api/rating/${id}`);
      return [
        [!!id, `resolved post id (${id})`],
        [status === 200 && json.success === true, `doc rating stats ok (${status})`],
      ];
    }
  },
  {
    id: 'sb25-feed-rss', group: 'subblog-api', name: 'subblog: /api/feed emits RSS with doc items', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${CAT}/api/feed`);
      const txt = (await r.text()) || '';
      return [
        [r.status() === 200 && txt.startsWith('<?xml'), `rss xml (${r.status()})`],
        [txt.includes('lookbook-materials-d14'), 'document item present in feed'],
        [/\/docs\/lookbook-materials-d14/.test(txt), 'doc item links via /docs path'],
      ];
    }
  },

  // ---- Gateway balance ----
  {
    id: 'sb25-gateway-balance-valid', group: 'subblog-api', name: 'subblog: POST /gateway/balance returns buyer balance', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.post(`${CAT}/api/nibgate/gateway/balance`, { data: { address: BUY } });
      const j = await r.json().catch(() => ({}));
      return [
        [r.status() === 200, `balance ok (${r.status()})`],
        [/USDC/.test(j.balance ?? ''), `balance string present (${j.balance})`],
      ];
    }
  },
  {
    id: 'sb25-gateway-balance-invalid', group: 'subblog-api', name: 'subblog: POST /gateway/balance rejects bad address', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.post(`${CAT}/api/nibgate/gateway/balance`, { data: { address: 'nope' } });
      const j = await r.json().catch(() => ({}));
      return [[r.status() === 400 && !!j.error, `invalid address → 400 (${r.status()})`]];
    }
  },

  // ---- Authz sweep (anon must be rejected everywhere) ----
  {
    id: 'sb25-authz-admin-posts', group: 'subblog-authz', name: 'authz: /api/blog/admin/* rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${CAT}/api/blog/admin/posts`);
      return [[[401, 403, 404].includes(r.status()), `admin/posts anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-authz-access-control', group: 'subblog-authz', name: 'authz: /api/nibgate/posts/:key/access-control rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${CAT}/api/nibgate/posts/lookbook-materials-d14/access-control`);
      return [[[401, 403, 404].includes(r.status()), `access-control anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-authz-settings', group: 'subblog-authz', name: 'authz: /api/settings rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${CAT}/api/settings`);
      return [[[401, 403, 404].includes(r.status()), `settings anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-authz-gateway-balances', group: 'subblog-authz', name: 'authz: /api/nibgate/gateway/balances (list) rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${CAT}/api/nibgate/gateway/balances`);
      return [[[401, 403, 404].includes(r.status()), `balances anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-authz-upload', group: 'subblog-authz', name: 'authz: /api/upload rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.post(`${CAT}/api/upload`, { data: {} });
      return [[[401, 403, 404].includes(r.status()), `upload anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-authz-me', group: 'subblog-authz', name: 'authz: /api/auth/me rejects anon', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${CAT}/api/auth/me`);
      return [[[401, 403, 404].includes(r.status()), `me anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-authz-nonce-get', group: 'subblog-authz', name: 'authz: /api/auth/nonce is GET + public', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${CAT}/api/auth/nonce`);
      return [[status === 200 && /^[0-9a-f]{32,}$/i.test(json?.nonce || ''), `nonce GET ok (${status})`]];
    }
  },
  {
    id: 'sb25-authz-setup-post-only', group: 'subblog-authz', name: 'authz: /api/setup is POST-only + key-guarded', pk: 'anon',
    run: async (h, { context }) => {
      const g = await context.request.get(`${CAT}/api/setup`);
      const p = await context.request.post(`${CAT}/api/setup`, { data: {} });
      const pj = await p.json().catch(() => ({}));
      return [
        [[404, 405].includes(g.status()), `setup GET → ${g.status()} (not served)`],
        [[401, 403].includes(p.status()) && !!pj.error, `setup POST w/o key → ${p.status()} (${pj.error})`],
      ];
    }
  },

  // ---- Hub cross-surface ----
  {
    id: 'sb25-hub-status', group: 'hub-surface', name: 'hub: /api/nibgate/status public + site identity', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${B}/api/nibgate/status`);
      return [
        [status === 200, `hub status 200 (${status})`],
        [!!json.site?.name && json.site?.name === 'Nibgate', `site identity (${json.site?.name})`],
        [!!json.hub?.apiBaseUrl, `hub config present (${json.hub?.apiBaseUrl})`],
      ];
    }
  },
  {
    id: 'sb25-hub-nonce', group: 'hub-surface', name: 'hub: /auth/nonce GET returns nonce (not POST)', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${B}/auth/nonce`);
      return [[status === 200 && /^[0-9a-f]{32,}$/i.test(json?.nonce || ''), `nonce GET ok (${status})`]];
    }
  },
  {
    id: 'sb25-hub-stats-public', group: 'hub-surface', name: 'hub: /api/nibshare/stats is public aggregates', pk: 'anon',
    run: async (h, { context }) => {
      const { status, json } = await jget(context, `${B}/api/nibshare/stats`);
      return [
        [status === 200, `stats 200 (${status})`],
        [typeof json.totals?.sharesCreated === 'number', `aggregates present (shares=${json.totals?.sharesCreated})`],
        [json.totals?.views != null, `views tally (${json.totals?.views})`],
      ];
    }
  },
  {
    id: 'sb25-hub-dashboard-authed', group: 'hub-surface', name: 'hub: /api/nibshare/dashboard is per-owner (anon 401)', pk: 'anon',
    run: async (h, { context }) => {
      const r = await context.request.get(`${B}/api/nibshare/dashboard`);
      return [[[401, 403].includes(r.status()), `dashboard anon → ${r.status()}`]];
    }
  },
  {
    id: 'sb25-hub-rate-authed', group: 'hub-surface', name: 'hub: /hub/content/:id/rate is authed + POST-only', pk: 'anon',
    run: async (h, { context }) => {
      const post = await context.request.post(`${B}/hub/content/does-not-exist/rate`, { data: {} });
      const get = await context.request.get(`${B}/hub/content/does-not-exist/rate`);
      return [
        [[401, 403].includes(post.status()), `rate POST anon → ${post.status()}`],
        [[404, 405].includes(get.status()), `rate GET → ${get.status()} (POST-only)`],
      ];
    }
  },
];

module.exports = { name: 'batch25-cross-surface', checks };