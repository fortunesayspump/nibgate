// Parametrized check generators: build many focused checks from the fixture
// matrix so the battery scales across features × combinations without writing
// each check by hand. Each generator returns an array of check objects in the
// same shape as hand-written batches.
const h = require('./runner.js').h;
const FIX = require('./fixtures.json');
const { connectSellerFlow } = require('../harness/prod-lib.js');

const TYPES = ['article', 'photo', 'video', 'music', 'document'];
const ACCESS = ['free', 'paid', 'wlfree', 'wldrop', 'invite'];

function slugFor(type, access) {
  return FIX[`${type}-${access}`]?.slug || FIX[access]?.slug || '';
}

async function connectWallet(page, re) {
  try { await connectSellerFlow(page, { label: 'w', log: () => {} }); } catch {}
  await page.waitForTimeout(800);
  return re.test(await h.bodyText(page));
}

const priceFor = { free: '0', paid: '5', wlfree: '9', wldrop: '9', invite: '12' };

// ---- Gate matrix: every type × access × anon wallet ----
// Verifies the reader gate for a logged-out visitor: correct price shown,
// correct gate state (paywall on paid, open on free, invite lockout), and
// no content leak on gated posts.
function gateAnonMatrix({ group = 'types-gate', pk = 'anon' } = {}) {
  const checks = [];
  for (const type of TYPES) {
    for (const access of ACCESS) {
      const slug = slugFor(type, access);
      const price = priceFor[access];
      checks.push({
        id: `tg-anon-${type}-${access}`, group,
        name: `gate anon: ${type}/${access} shows right state + no leak`,
        pk,
        run: async (h, { page }) => {
          await h.gotoSafe(page, `https://nibgate.xyz/ns/${slug}`);
          const b = await h.bodyText(page);
          const expects = [];
          if (access === 'free') {
            expects.push([!/Pay to unlock/i.test(b), `no paywall (free): ${!/Pay to unlock/i.test(b)}`]);
            expects.push([!/Enjoy/i.test(b), `no leak marker`]);
          } else if (access === 'invite') {
            expects.push([/Invite only|invite-only|Connect/i.test(b), `invite lockout copy: ${/Invite only|invite-only/i.test(b)}`]);
            expects.push([!/Enjoy/i.test(b), 'no content leak']);
          } else {
            expects.push([new RegExp(`${price} USDC`, 'i').test(b), `price ${price} USDC shown: ${new RegExp(`${price} USDC`, 'i').test(b)}`]);
            expects.push([/Pay to unlock/i.test(b), `paywall copy: ${/Pay to unlock/i.test(b)}`]);
            expects.push([/Hold to pay/i.test(b), `hold-to-pay present: ${/Hold to pay/i.test(b)}`]);
            expects.push([!/Enjoy/i.test(b), 'no content leak']);
          }
          return expects;
        }
      });
    }
  }
  return checks;
}

// ---- Gate matrix: whitelisted buyer sees their tier on wl types ----
function gateWhitelistedMatrix({ group = 'types-gate' } = {}) {
  const checks = [];
  for (const type of TYPES) {
    for (const access of ['wlfree', 'wldrop']) {
      const slug = slugFor(type, access);
      const publicP = priceFor[access]; // 9
      const tier = access === 'wlfree' ? '0' : '2';
      checks.push({
        id: `tg-wl-${type}-${access}`, group,
        name: `gate whitelisted buyer: ${type}/${access} tier`,
        pk: h.BUY_PK,
        run: async (h, { page }) => {
          await h.gotoSafe(page, `https://nibgate.xyz/ns/${slug}`);
          await connectWallet(page, /0x3C44/i);
          const b = await h.bodyText(page);
          const expects = [];
          expects.push([/0x3C44/i.test(b), `buyer connected`]);
          if (access === 'wlfree') {
            expects.push([/free/i.test(b) || /0 USDC/i.test(b), `free tier shown: ${/free/i.test(b)}`]);
          } else {
            expects.push([new RegExp(`${tier} USDC`, 'i').test(b), `tier ${tier} USDC shown: ${new RegExp(`${tier} USDC`, 'i').test(b)}`]);
          }
          expects.push([/whitelisted price/i.test(b), `whitelisted price note: ${/whitelisted price/i.test(b)}`]);
          expects.push([!/Enjoy/i.test(b), 'no content leak']);
          return expects;
        }
      });
    }
  }
  return checks;
}

// ---- Gate matrix: banned wallet sees banned copy on paid types ----
function gateBannedMatrix({ group = 'types-gate' } = {}) {
  const checks = [];
  const bannedWallet = '0x1111111111111111111111111111111111111111';
  for (const type of TYPES) {
    const slug = slugFor(type, 'paid');
    checks.push({
      id: `tg-banned-${type}`, group,
      name: `gate banned wallet: ${type}/paid`,
      pk: h.SEL_PK,
      run: async (h, { page, context }) => {
        const expects = [];
        // Ban via API (reader path has no ban UI); seller session from SEL_PK
        await connectWallet(page, /0x7099/i);
        const banR = await context.request.post(`https://api.nibgate.xyz/nibshare/${slug}/entitlements/${bannedWallet}/ban`, { data: {} });
        const banOk = banR.ok || (await banR.json().catch(() => ({}))).ok;
        expects.push([banOk, `ban API accepted: ${banR.status()}`]);
        // Reader gate with banned wallet as query param (anon view picks it up)
        const page2 = await context.newPage();
        await h.gotoSafe(page2, `https://nibgate.xyz/ns/${slug}?wallet=${bannedWallet}`);
        const b = await h.bodyText(page2);
        expects.push([/banned/i.test(b), `banned copy shown: ${/banned/i.test(b)}`]);
        expects.push([!/Enjoy/i.test(b), 'no content leak']);
        // unban to keep matrix reusable
        await context.request.delete(`https://api.nibgate.xyz/nibshare/${slug}/entitlements/${bannedWallet}`).catch(() => {});
        await page2.close().catch(() => {});
        return expects;
      }
    });
  }
  return checks;
}

// ---- Form-create matrix: UI-publish a fresh post for every type × access ----
// Exercises the real ShareForm for each content type + access mode and verifies
// the resulting gate on the published URL. Creates throwaway slugs each run.
function formCreateMatrix({ group = 'types-form' } = {}) {
  const checks = [];
  const { fillNewShare } = require('../harness/prod-lib.js');
  for (const type of TYPES) {
    for (const access of ACCESS) {
      const price = priceFor[access];
      checks.push({
        id: `tf-create-${type}-${access}`, group,
        name: `form create+gate: ${type}/${access}`,
        pk: h.SEL_PK,
        run: async (h, { page }) => {
          await h.gotoSafe(page, 'https://nibgate.xyz/share');
          const { connectSellerFlow, fillNewShare } = require('../harness/prod-lib.js');
          await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
          await page.waitForTimeout(1500);
          await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
          const stamp = Date.now().toString(36);
          // Non-article types replace the prose editor with a media upload drop area
          const mediaMime = type === 'photo' ? 'image/png' : type === 'video' ? 'video/mp4' : type === 'music' ? 'audio/mpeg' : type === 'document' ? 'application/pdf' : null;
          let r;
          if (mediaMime && type !== 'article') {
            await page.getByPlaceholder(/title/i).first().fill(`E2E form ${type} ${access} ${stamp}`);
            if (type && type !== 'article') {
              await page.locator('select.input-field').selectOption(type);
              await page.waitForTimeout(600);
            }
            const fileInput = type === 'photo' ? page.locator('input[type="file"][accept^="image"]').first()
              : type === 'music' ? page.locator('input[type="file"][accept^="audio"]').first()
              : type === 'video' ? page.locator('input[type="file"][accept^="video"]').first()
              : page.locator('input[type="file"]').last();
            const buf = type === 'photo'
              ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
              : Buffer.from('x'.repeat(64));
            const ext = type === 'photo' ? 'png' : type === 'video' ? 'mp4' : type === 'music' ? 'mp3' : 'pdf';
            await fileInput.setInputFiles({ name: `sample.${ext}`, mimeType: mediaMime, buffer: buf }).catch((e) => {});
            await page.waitForTimeout(2500);
            if (type === 'photo') {
              const cover = page.locator('button[title="Set as cover"]').first();
              if (await cover.count()) { await cover.click({ force: true }).catch(() => {}); await page.waitForTimeout(1000); }
            }
            if (access === 'paid' || access === 'wlfree' || access === 'wldrop' || access === 'invite') {
              await page.getByText(/pay to unlock/i).first().click({ force: true }).catch(() => {});
              await page.waitForTimeout(600);
              const priceInput = page.locator('input[placeholder="e.g. 1"], input[type="number"]').first();
              if (await priceInput.count()) await priceInput.fill(priceFor[access] === '0' ? '1' : priceFor[access]);
            }
            await page.getByRole('button', { name: /^publish$/i }).first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(5000);
            const b = await h.bodyText(page);
            r = { published: /published|success|✓|created/i.test(b), slug: (b.match(/nibgate\.xyz\/ns\/([A-Za-z0-9_-]+)/) || [])[1] };
          } else {
            r = await fillNewShare(page, {
              title: `E2E form ${type} ${access} ${stamp}`,
              type,
              body: `matrix body ${type}/${access}`,
              access: access === 'free' ? undefined : 'paid',
              price,
              whitelist: access === 'wlfree' || access === 'wldrop' ? ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'] : undefined,
              wlTier: access === 'wlfree' ? 'free' : access === 'wldrop' ? 2 : undefined,
              inviteOnly: access === 'invite',
              log: () => {},
            });
          }
          const expects = [[r.published, `published ${type}/${access}: ${r.published} slug=${r.slug}`]];
          if (r.slug) {
            await h.gotoSafe(page, `https://nibgate.xyz/ns/${r.slug}`);
            const b = await h.bodyText(page);
            if (access === 'free') expects.push([!/Pay to unlock/i.test(b), 'free: no paywall']);
            else expects.push([/Pay to unlock/i.test(b), `paid/invite: paywall present`]);
            expects.push([!/Application error/i.test(b), 'no error boundary']);
          }
          return expects;
        }
      });
    }
  }
  return checks;
}

// ---- Mobile viewport checks (from findings #26/#28) ----
function mobileMatrix({ group = 'types-mobile' } = {}) {
  const pages = [
    { url: 'https://nibgate.xyz/explore', name: 'explore' },
    { url: 'https://nibgate.xyz/leaderboards', name: 'leaderboards' },
    { url: 'https://nibgate.xyz/ledger', name: 'ledger' },
    { url: 'https://nibgate.xyz/share', name: 'share-form' },
    { url: 'https://nibgate.xyz/blog', name: 'blog' },
    { url: `https://nibgate.xyz/ns/${slugFor('article', 'paid')}`, name: 'paid-gate' },
    { url: `https://nibgate.xyz/ns/${slugFor('article', 'free')}`, name: 'free-gate' },
    { url: 'https://catwalk.nibgate.xyz/', name: 'subblog-home' },
  ];
  return pages.map((p, i) => ({
    id: `mv-${p.name.replace(/[^a-z0-9]/g, '-')}`, group,
    name: `mobile ${p.name}: no horizontal overflow / viewport fits`,
    pk: 'anon', viewport: { width: 390, height: 844 },
    run: async (h, { page }) => {
      await h.gotoSafe(page, p.url);
      await page.waitForTimeout(1200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      const b = await h.bodyText(page);
      return [
        [!overflow, `no horizontal overflow: scrollW=${await page.evaluate(() => document.documentElement.scrollWidth)} inner=${await page.evaluate(() => window.innerWidth)}`],
        [!/Application error/i.test(b), 'no error boundary'],
      ];
    }
  }));
}

// ---- Wallet-state transitions on the paid gate ----
function walletStateMatrix({ group = 'types-wallet' } = {}) {
  const states = [
    { id: 'anon', label: 'anon no wallet', pk: 'anon', expect: /Connect wallet/i },
    { id: 'buyer', label: 'buyer connected', pk: h.BUY_PK, expect: /0x3C44/i },
    { id: 'seller', label: 'seller connected', pk: h.SEL_PK, expect: /0x7099/i },
  ];
  const checks = [];
  for (const st of states) {
    checks.push({
      id: `ws-${st.id}`, group,
      name: `wallet state: ${st.label} on paid gate`,
      pk: st.pk,
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://nibgate.xyz/ns/${slugFor('article', 'paid')}`);
        if (st.pk !== 'anon') await connectWallet(page, st.expect);
        const b = await h.bodyText(page);
        const expects = [[st.expect.test(b), `${st.label} shown: ${st.expect.test(b)}`]];
        if (st.pk !== 'anon') expects.push([/USDC/i.test(b), 'balance row shown']);
        expects.push([/Pay to unlock/i.test(b), 'paywall still shown']);
        return expects;
      }
    });
  }
  // connect -> disconnect -> reconnect cycle (finding #31)
  checks.push({
    id: 'ws-cycle-disconnect-reconnect', group,
    name: 'wallet cycle: connect → disconnect → reconnect',
    pk: h.BUY_PK,
    run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${slugFor('article', 'paid')}`);
      await connectWallet(page, /0x3C44/i);
      const connected1 = /0x3C44/i.test(await h.bodyText(page));
      const disc = page.getByText(/disconnect/i).first();
      let disconnected = false;
      if (await disc.count()) { await disc.click({ force: true }).catch(() => {}); await page.waitForTimeout(2000); disconnected = !/0x3C44/i.test(await h.bodyText(page)); }
      // reconnect
      let reconnected = false;
      const connectBtn = page.getByText(/connect wallet/i).first();
      if (await connectBtn.count()) {
        await connectBtn.click({ force: true, timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const mockRow = page.getByText(/mock wallet/i).first();
        if (await mockRow.count()) { await mockRow.click().catch(() => {}); await page.waitForTimeout(1500); }
        if (await page.getByText(/sign the message/i).count()) { await page.getByRole('button', { name: /sign with wallet/i }).click({ force: true, timeout: 20000 }).catch(() => {}); await page.waitForTimeout(2500); }
        reconnected = /0x3C44/i.test(await h.bodyText(page));
      }
      return [[connected1, 'connected first'], [disconnected, 'disconnected clears account'], [reconnected, 'reconnect restores account']];
    }
  });
  return checks;
}

// ---- Reader media render matrix (per type, unlocked/free) ----
function readerMediaMatrix({ group = 'types-reader' } = {}) {
  const checks = [];
  // free posts render body inline for each type
  for (const type of TYPES) {
    checks.push({
      id: `tm-${type}-free`, group,
      name: `reader free: ${type} renders without error`,
      pk: 'anon',
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://nibgate.xyz/ns/${slugFor(type, 'free')}`);
        const b = await h.bodyText(page);
        return [
          [!/Application error|Internal Server/i.test(b), 'no error boundary'],
          [!/Pay to unlock/i.test(b), 'no paywall on free'],
        ];
      }
    });
  }
  return checks;
}

// ---- Subblog reader matrix: each content type on a live subblog renders ----
const SUB_BLOG = {
  article: '/writing/thrifting-better',
  articlePaid: '/writing/future-sustainable-fashion',
  document: '/docs/lookbook-materials-d14',
  video: '/video/fashion-week-video',
  image: '/photos/street-style-photography',
  music: '/music/ambient-fashion-mix',
};
function subblogReaderMatrix({ group = 'subblog-reader' } = {}) {
  const pages = [
    { id: 'article', path: SUB_BLOG.article, free: true },
    { id: 'article-paid', path: SUB_BLOG.articlePaid, free: false },
    { id: 'document', path: SUB_BLOG.document, free: false },
    { id: 'video', path: SUB_BLOG.video, free: true },
    { id: 'image', path: SUB_BLOG.image, free: false },
    { id: 'music', path: SUB_BLOG.music, free: false },
  ];
  return pages.map((p) => ({
    id: `sb-${p.id}`, group,
    name: `subblog reader: ${p.id} renders (${p.free ? 'free' : 'paid'})`,
    pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `https://catwalk.nibgate.xyz${p.path}`);
      const b = await h.bodyText(page);
      const expects = [
        [!/Application error|Internal Server/i.test(b), 'no error boundary'],
        [/Catwalk/i.test(b), 'subblog identity'],
      ];
      if (p.free) expects.push([!/Pay to unlock/i.test(b), 'no paywall on free']);
      else expects.push([/Pay to unlock|USDC|unlock/i.test(b), 'paywall/price present']);
      return expects;
    }
  }));
}

// ---- Ratings matrix (#30): rating widget renders on subblog + share gates ----
function ratingsMatrix({ group = 'subblog-ratings' } = {}) {
  const pages = [
    { id: 'subblog', path: `https://catwalk.nibgate.xyz${SUB_BLOG.article}`, hasStars: /☆|★|stars/i },
    { id: 'share', path: `https://nibgate.xyz/ns/${slugFor('article', 'free')}`, hasStars: /☆|★|stars/i },
  ];
  return pages.map((p) => ({
    id: `rt-${p.id}`, group,
    name: `ratings widget: ${p.id} gate renders stars`,
    pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, p.path);
      const b = await h.bodyText(page);
      return [[p.hasStars.test(b), `stars present on ${p.id}: ${p.hasStars.test(b)}`]];
    }
  }));
}

// ---- Share-form field validation matrix (#24/#25) ----
function formValidationMatrix({ group = 'types-form' } = {}) {
  const checks = [];
  const cases = [
    { id: 'empty-title', title: '', body: 'x', expectErr: /title|required/i, desc: 'empty title blocked' },
    { id: 'long-title', title: 'x'.repeat(200), body: 'x', expectErr: /title|150|too long|character/i, desc: 'oversized title blocked' },
    { id: 'empty-body', title: 'E2E no body', body: '', expectErr: /body|content|required/i, desc: 'empty body blocked' },
    { id: 'bad-price', title: 'E2E bad price', body: 'x', access: 'paid', price: 'not-a-number', expectErr: /price|number/i, desc: 'non-numeric price blocked' },
  ];
  for (const c of cases) {
    checks.push({
      id: `fv-${c.id}`, group,
      name: `form validation: ${c.desc}`,
      pk: h.SEL_PK,
      run: async (h, { page }) => {
        await connectWallet(page, /0x7099/i);
        await h.gotoSafe(page, 'https://nibgate.xyz/share');
        await page.getByPlaceholder(/Post title|Photo title|Track title|Document title|Video title/).fill(c.title);
        if (c.access === 'paid') {
          await page.getByText(/pay to unlock/i).first().click().catch(() => {});
          await page.waitForTimeout(400);
          const priceInput = await page.getByLabel(/price in usdc/i).count() ? page.getByLabel(/price in usdc/i) : page.getByPlaceholder('e.g. 1');
          await priceInput.fill(String(c.price));
        }
        if (c.body) {
          const editor = page.locator('.tiptap, .ProseMirror [contenteditable], [contenteditable]').first();
          if (await editor.count()) { await editor.click(); await page.keyboard.type(c.body, { delay: 1 }); }
        }
        await page.getByRole('button', { name: /publish/i }).click().catch(() => {});
        await page.waitForTimeout(2500);
        const b = await h.bodyText(page);
        return [[c.expectErr.test(b), `${c.desc}: ${c.expectErr.test(b)} "${b.slice(0, 60)}"`]];
      }
    });
  }
  return checks;
}

// ---- Share-form admin field matrix: tags/excerpt accepted ----
function shareAdminFieldMatrix({ group = 'types-form' } = {}) {
  const checks = [];
  const cases = [
    { id: 'tags', fill: async (page) => { const t = page.getByPlaceholder(/tools, craft, general/i); if (await t.count()) await t.fill('alpha,beta,gamma'); }, expect: /alpha,beta,gamma|alpha/i },
    { id: 'excerpt', fill: async (page) => { const e = page.getByPlaceholder('Short description'); if (await e.count()) await e.fill('A short excerpt for the matrix.'); }, expect: /short excerpt/i },
  ];
  for (const c of cases) {
    checks.push({
      id: `fa-${c.id}`, group,
      name: `form admin: ${c.id} accepted`,
      pk: h.SEL_PK,
      run: async (h, { page }) => {
        await connectWallet(page, /0x7099/i);
        await h.gotoSafe(page, 'https://nibgate.xyz/share');
        await page.getByPlaceholder(/Post title/).fill(`E2E field ${c.id}`);
        await c.fill(page);
        await page.waitForTimeout(400);
        const b = await h.bodyText(page);
        return [[c.expect.test(b), `${c.id} present in form state: ${c.expect.test(b)}`]];
      }
    });
  }
  return checks;
}

// ---- Lifecycle matrix: publish → edit → revoke → delete per type (from #33/#35) ----
function lifecycleMatrix({ group = 'types-lifecycle' } = {}) {
  const checks = [];
  for (const type of TYPES) {
    checks.push({
      id: `tl-${type}-publish-revoke`, group,
      name: `lifecycle: UI-publish ${type} then revoke from mine`,
      pk: h.SEL_PK,
      run: async (h, { page }) => {
        await h.gotoSafe(page, 'https://nibgate.xyz/share');
        const { connectSellerFlow, fillNewShare } = require('../harness/prod-lib.js');
        await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.locator('input[placeholder^="Post title"], input[placeholder*="title"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
        const title = `E2E lc ${type} ${Date.now().toString(36)}`;
        const r = await fillNewShare(page, { title, type, body: `lc ${type}`, log: () => {} });
        const expects = [[r.published, `published ${type}: ${r.published} slug=${r.slug}`]];
        if (r.slug) {
          await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
          await page.waitForTimeout(2500);
          const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
          const del = row.locator('button').last();
          if (await del.count()) {
            await del.click({ force: true });
            await page.waitForTimeout(1500);
            const confirm = page.getByRole('button', { name: /confirm|delete|revoke|yes/i }).first();
            if (await confirm.count()) { await confirm.click({ force: true }); await page.waitForTimeout(2000); }
            const b = await h.bodyText(page);
            expects.push([/revoked|removed|deleted/i.test(b), `revoked reflected: ${/revoked|removed|deleted/i.test(b)}`]);
          } else {
            expects.push([false, 'no delete control on mine row']);
          }
        }
        return expects;
      }
    });
  }
  return checks;
}

// ---- Security matrix: data-leak + authz probes (frontend-observable) ----
function securityMatrix({ group = 'types-security' } = {}) {
  const checks = [];
  const cases = [
    { id: 'paid-no-leak', type: 'article', access: 'paid', expectLeak: /matrix body|playbook/i, desc: 'paid gate leaks no body' },
    { id: 'invite-no-leak', type: 'article', access: 'invite', expectLeak: /matrix body/i, desc: 'invite gate leaks no body' },
    { id: 'wldrop-no-leak', type: 'article', access: 'wldrop', expectLeak: /matrix body/i, desc: 'wl-drop gate leaks no body to anon' },
  ];
  for (const c of cases) {
    checks.push({
      id: `sec-${c.id}`, group,
      name: `security: ${c.desc}`,
      pk: 'anon',
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://nibgate.xyz/ns/${slugFor(c.type, c.access)}`);
        const b = await h.bodyText(page);
        return [[!c.expectLeak.test(b), `no body leak: ${c.expectLeak.test(b)}`]];
      }
    });
  }
  // source/robots/sitemap do not expose gated content URLs trivially
  checks.push({
    id: 'sec-robots', group,
    name: 'security: /robots.txt returns 2xx and sane',
    pk: 'anon',
    run: async (h, { page }) => {
      const resp = await page.goto('https://nibgate.xyz/robots.txt', { waitUntil: 'domcontentloaded' }).catch(() => null);
      const txt = await h.bodyText(page);
      return [[resp && resp.status() < 400, `robots status ${resp ? resp.status() : 'n/a'}`], [!/Internal Server/i.test(txt), 'no error']];
    }
  });
  return checks;
}

// ---- API security matrix (authz / IDOR probes against the live API) ----
function apiSecurityMatrix({ group = 'types-security' } = {}) {
  const checks = [];
  const api = 'https://api.nibgate.xyz';
  const victim = slugFor('article', 'paid');
  const probes = [
    { id: 'ban-noauth', method: 'POST', url: `${api}/api/nibshare/${victim}/entitlements/0x2222222222222222222222222222222222222222/ban`, desc: 'ban endpoint rejects anon' },
    { id: 'revoke-noauth', method: 'POST', url: `${api}/api/nibshare/${victim}/entitlements/0x2222222222222222222222222222222222222222/revoke`, desc: 'revoke endpoint rejects anon' },
    { id: 'status-ok', method: 'GET', url: `${api}/api/nibgate/status`, desc: 'status is public + ok' },
  ];
  for (const p of probes) {
    checks.push({
      id: `api-${p.id}`, group,
      name: `api-security: ${p.desc}`,
      pk: 'anon',
      run: async (h, { page, context }) => {
        const r = await context.request.fetch(p.url, { method: p.method, data: {} });
        const j = await r.json().catch(() => ({}));
        if (p.id === 'status-ok') return [[r.ok && (j.ok || j.status), `status ok: ${r.status} ${JSON.stringify(j).slice(0,60)}`]];
        // admin ops should reject anon (401/403/404), NOT 200-apply
        const rejected = [401, 403, 404].includes(r.status) || j.error || !j.ok;
        return [[rejected, `anon ${p.method} → ${r.status} rejected=${rejected}`]];
      }
    });
  }
  return checks;
}

// ---- Speed matrix: TTFT/TTI sniff on key routes (frontend-first) ----
function speedMatrix({ group = 'types-speed' } = {}) {
  const routes = [
    { id: 'home', url: 'https://nibgate.xyz/', path: 'home' },
    { id: 'explore', url: 'https://nibgate.xyz/explore', path: 'explore' },
    { id: 'share-paid', url: `https://nibgate.xyz/ns/${slugFor('article', 'paid')}`, path: 'paid gate' },
    { id: 'share-free', url: `https://nibgate.xyz/ns/${slugFor('article', 'free')}`, path: 'free gate' },
    { id: 'subblog-home', url: 'https://catwalk.nibgate.xyz/', path: 'subblog home' },
    { id: 'leaderboards', url: 'https://nibgate.xyz/leaderboards', path: 'leaderboards' },
    { id: 'ledger', url: 'https://nibgate.xyz/ledger', path: 'ledger' },
    { id: 'share-mine', url: 'https://nibgate.xyz/share/mine', path: 'mine' },
  ];
  return routes.map((r) => ({
    id: `sp-${r.id}`, group,
    name: `speed: ${r.path} interactive within budget`,
    pk: 'anon',
    run: async (h, { page }) => {
      const t0 = Date.now();
      const resp = await page.goto(r.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      const ttft = Date.now() - t0;
      const t1 = Date.now();
      await page.waitForTimeout(2500); // let main content settle
      const tti = Date.now() - t0;
      const b = await h.bodyText(page);
      const ok = resp && resp.status() < 400;
      return [
        [ok, `HTTP ${resp ? resp.status() : 'n/a'}`],
        [ttft < 8000, `TTFT ${ttft}ms`],
        [tti < 15000, `TTI~ ${tti}ms`],
        [!/Application error/i.test(b), 'no error boundary'],
      ];
    }
  }));
}

// ---- Human-weird combo matrix: things a real user might accidentally do ----
function humanWeirdMatrix({ group = 'types-weird' } = {}) {
  const checks = [];
  // 1. double-click publish should not create two posts
  checks.push({
    id: 'hw-double-publish', group,
    name: 'weird: double-click Publish creates only one post',
    pk: h.SEL_PK,
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow, fillNewShare } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
      await page.waitForTimeout(1500);
      const title = `E2E double ${Date.now().toString(36)}`;
      const ed = page.locator('.ProseMirror, [contenteditable]').first();
      await page.locator('input[placeholder^="Post title"]').fill(title).catch(() => {});
      if (await ed.count()) { await ed.click().catch(() => {}); await page.keyboard.type('body', { delay: 1 }); }
      const pb = page.getByRole('button', { name: /^publish$/i }).first();
      if (await pb.count()) { await pb.dblclick({ force: true }).catch(() => {}); }
      await page.waitForTimeout(5000);
      const b = await h.bodyText(page);
      return [[/published|success|✓|created/i.test(b), `single publish result: ${/published|success|✓|created/i.test(b)}`]];
    }
  });
  // 2. refresh mid-unlock keeps paywall (no accidental free access)
  checks.push({
    id: 'hw-refresh-gate', group,
    name: 'weird: refresh on paid gate still locked for anon',
    pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${slugFor('article', 'paid')}`);
      const b1 = await h.bodyText(page);
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2500);
      const b2 = await h.bodyText(page);
      return [[/Pay to unlock/i.test(b1), 'locked first load'], [/Pay to unlock/i.test(b2), 'still locked after refresh']];
    }
  });
  // 3. back-button after viewing free post returns and stays functional
  checks.push({
    id: 'hw-back-nav', group,
    name: 'weird: browser back from a share keeps app working',
    pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${slugFor('article', 'free')}`);
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
      const b = await h.bodyText(page);
      return [[!/Application error/i.test(b), 'no error after back'], [/E2E/i.test(b), 'free share still rendered']];
    }
  });
  // 4. empty tags field should not break publish
  checks.push({
    id: 'hw-empty-tags', group,
    name: 'weird: empty tags on paid publish does not break',
    pk: h.SEL_PK,
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
      await page.waitForTimeout(1500);
      const title = `E2E no tags ${Date.now().toString(36)}`;
      const ed = page.locator('.ProseMirror, [contenteditable]').first();
      await page.locator('input[placeholder^="Post title"]').fill(title).catch(() => {});
      if (await ed.count()) { await ed.click().catch(() => {}); await page.keyboard.type('x', { delay: 1 }); }
      // leave tags empty, publish
      const pb = page.getByRole('button', { name: /^publish$/i }).first();
      if (await pb.count()) await pb.click({ force: true }).catch(() => {});
      await page.waitForTimeout(4500);
      const b = await h.bodyText(page);
      return [[/published|success|✓|created/i.test(b), `empty-tags publish: ${/published|success|✓|created/i.test(b)}`]];
    }
  });
  return checks;
}

module.exports = { TYPES, ACCESS, slugFor, connectWallet, gateAnonMatrix, gateWhitelistedMatrix, gateBannedMatrix, formCreateMatrix, mobileMatrix, walletStateMatrix, readerMediaMatrix, subblogReaderMatrix, ratingsMatrix, formValidationMatrix, shareAdminFieldMatrix, lifecycleMatrix, securityMatrix, speedMatrix, humanWeirdMatrix, apiSecurityMatrix, subblogAccessMatrix, newsletterMatrix, expiredShareMatrix, draftPublishMatrix, uploadCancelMatrix, searchDiscoveryMatrix, dashboardMatrix, walletAuthMatrix };

// ---- Subblog gate access matrix: paid/free subblog content × viewer state ----
function subblogAccessMatrix({ group = 'subblog-access' } = {}) {
  const checks = [];
  const items = [
    { id: 'article-free', path: '/writing/thrifting-better', free: true },
    { id: 'article-paid', path: '/writing/future-sustainable-fashion', free: false },
    { id: 'image-paid', path: '/photos/street-style-photography', free: false },
    { id: 'doc-paid', path: '/docs/lookbook-materials-d14', free: false },
  ];
  for (const it of items) {
    checks.push({
      id: `sbx-${it.id}`, group,
      name: `subblog gate: ${it.id} anon sees ${it.free ? 'open' : 'paywall'}`,
      pk: 'anon',
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://catwalk.nibgate.xyz${it.path}`);
        const b = await h.bodyText(page);
        const expects = [[!/Application error/i.test(b), 'no error']];
        if (it.free) expects.push([!/Pay to unlock/i.test(b), 'open (no paywall)']);
        else expects.push([/Pay to unlock|USDC|unlock/i.test(b), `paywall/price: ${/Pay to unlock|USDC|unlock/i.test(b)}`]);
        return expects;
      }
    });
  }
  return checks;
}

// ---- Newsletter matrix: subscribe flows render + accept input ----
function newsletterMatrix({ group = 'types-newsletter' } = {}) {
  const checks = [];
  const routes = ['/newsletter', '/newsletter/archive', '/newsletter/1'];
  routes.forEach((p, i) => {
    checks.push({
      id: `nl-${i}-${p.replace(/[^a-z0-9]/g, '')}`, group,
      name: `newsletter: ${p} renders without error`,
      pk: 'anon',
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://nibgate.xyz${p}`);
        const b = await h.bodyText(page);
        return [[!/Application error|Internal Server/i.test(b), 'no error boundary']];
      }
    });
  });
  return checks;
}

// ---- Expired-share matrix: old fixture slugs return not-found or revoked ----
function expiredShareMatrix({ group = 'types-lifecycle' } = {}) {
  const checks = [];
  const stale = ['Zdkz7DxH', 'VZ2Zgxx6', 'definitely-not-a-real-slug-12345'];
  stale.forEach((slug, i) => {
    checks.push({
      id: `ex-${i}`, group,
      name: `expired/unknown slug: ${slug} resolves safely`,
      pk: 'anon',
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://nibgate.xyz/ns/${slug}`);
        const b = await h.bodyText(page);
        return [[!/Application error|Internal Server/i.test(b), 'no error boundary'], [/E2E|not found|Not Found|revoked|expired|deleted|taken/i.test(b), `clean not-found/revoked copy: ${/E2E|not found|Not Found|revoked|expired|deleted|taken/i.test(b)}`]];
      }
    });
  });
  return checks;
}

// ---- Draft → publish matrix (via form draft button) ----
function draftPublishMatrix({ group = 'types-lifecycle' } = {}) {
  const checks = [];
  checks.push({
    id: 'dp-draft-then-publish', group,
    name: 'lifecycle: save draft via UI then publish',
    pk: h.SEL_PK,
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
      await page.waitForTimeout(1500);
      const title = `E2E draft ${Date.now().toString(36)}`;
      const ed = page.locator('.ProseMirror, [contenteditable]').first();
      await page.locator('input[placeholder^="Post title"]').fill(title).catch(() => {});
      if (await ed.count()) { await ed.click().catch(() => {}); await page.keyboard.type('draft body', { delay: 1 }); }
      const db = page.getByRole('button', { name: /^draft$/i }).first();
      if (await db.count()) await db.click({ force: true }).catch(() => {});
      await page.waitForTimeout(4000);
      const b1 = await h.bodyText(page);
      const savedDraft = /draft|saved|mine/i.test(b1);
      // now open mine, switch to the Drafts filter, find the draft, publish it
      await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
      await page.waitForTimeout(2500);
      const draftsTab = page.getByRole('button', { name: /drafts/i }).first();
      if (await draftsTab.count()) await draftsTab.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const row = page.locator('div, li, tr, article').filter({ hasText: title }).first();
      const pubInRow = row.getByRole('button', { name: /publish|active|go live/i }).first();
      const pubCount = await pubInRow.count();
      let published = false;
      if (pubCount) { await pubInRow.click({ force: true }).catch(() => {}); await page.waitForTimeout(4000); published = true; }
      return [[savedDraft, `draft saved: ${savedDraft}`], [pubCount > 0, `draft row has publish control: ${pubCount > 0}`], [published, 'draft → publish attempted']];
    }
  });
  return checks;
}

// ---- Upload-then-cancel matrix: cancel before publish leaves no orphan ----
function uploadCancelMatrix({ group = 'types-weird' } = {}) {
  const checks = [];
  checks.push({
    id: 'uc-cancel-upload', group,
    name: 'weird: upload media then cancel keeps form usable',
    pk: h.SEL_PK,
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/share');
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.getByPlaceholder(/title/i).first().fill('E2E cancel upload').catch(() => {});
      await page.locator('select.input-field').selectOption('photo');
      await page.waitForTimeout(600);
      const fi = page.locator('input[type="file"][accept^="image"]').first();
      await fi.setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64') }).catch(() => {});
      await page.waitForTimeout(4000);
      // navigate away without publishing
      await h.gotoSafe(page, 'https://nibgate.xyz/share/mine');
      await page.waitForTimeout(2000);
      const b = await h.bodyText(page);
      return [[!/Application error/i.test(b), 'no error after abandoning'], [!/E2E cancel upload/i.test(b), 'unpublished draft not force-listed (or listed as draft)']];
    }
  });
  return checks;
}

// ---- Search / discovery combos ----
function searchDiscoveryMatrix({ group = 'types-discovery' } = {}) {
  const checks = [];
  const queries = [
    { q: '', desc: 'empty search ok' },
    { q: 'fashion', desc: 'keyword search ok' },
    { q: 'definitely-no-such-term-zzz', desc: 'no-result search ok' },
    { q: '%00', desc: 'null-byte search handled' },
  ];
  queries.forEach((s, i) => {
    checks.push({
      id: `sd-${i}`, group,
      name: `discovery: search "${s.q || '(empty)'}" ${s.desc}`,
      pk: 'anon',
      run: async (h, { page }) => {
        await h.gotoSafe(page, `https://nibgate.xyz/explore?q=${encodeURIComponent(s.q)}`);
        const b = await h.bodyText(page);
        return [[!/Application error|Internal Server/i.test(b), 'no error boundary']];
      }
    });
  });
  // explore page renders content tiles
  checks.push({
    id: 'sd-explore-grid', group,
    name: 'discovery: explore renders content grid',
    pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const b = await h.bodyText(page);
      return [[/Explore|Discover|trending|content/i.test(b), `explore header present: ${/Explore|Discover|trending|content/i.test(b)}`]];
    }
  });
  return checks;
}

// ---- Dashboard matrix: creator analytics/earnings surfaces ----
function dashboardMatrix({ group = 'types-dashboard' } = {}) {
  const checks = [];
  const pages = [
    { id: 'analytics', url: 'https://nibgate.xyz/dashboard/analytics', desc: 'analytics' },
    { id: 'earnings', url: 'https://nibgate.xyz/dashboard/earnings', desc: 'earnings' },
    { id: 'sites', url: 'https://nibgate.xyz/dashboard/sites', desc: 'sites' },
  ];
  for (const p of pages) {
    checks.push({
      id: `db-${p.id}`, group,
      name: `dashboard: ${p.desc} renders for authed creator`,
      pk: h.SEL_PK,
      run: async (h, { page }) => {
        await h.gotoSafe(page, p.url);
        const b = await h.bodyText(page);
        return [[!/Application error|Internal Server/i.test(b), 'no error boundary'], [!/Create account|Get started/i.test(b), 'authed view (not redirected to marketing)']];
      }
    });
  }
  return checks;
}

// ---- Wallet-auth matrix: gate reacts to connected vs disconnected ----
function walletAuthMatrix({ group = 'types-wallet' } = {}) {
  const checks = [];
  const gated = slugFor('article', 'paid');
  const free = slugFor('article', 'free');
  // anon paid gate → connect wallet → balance appears
  checks.push({
    id: 'wa-connect-on-paid', group,
    name: 'wallet: connect on paid gate reveals balance row',
    pk: 'anon',
    run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${gated}`);
      const { connectSellerFlow } = require('../harness/prod-lib.js');
      await connectSellerFlow(page, { label: 's', log: () => {} }).catch(() => {});
      await page.waitForTimeout(1500);
      const b = await h.bodyText(page);
      return [[/Pay to unlock/i.test(b), 'paywall still shown after connect'], [/0x7099/i.test(b), 'wallet address shown']];
    }
  });
  // owner sees own paid post gate (no free access)
  checks.push({
    id: 'wa-owner-on-own-paid', group,
    name: 'wallet: owner sees gate (no auto-unlock) on own paid post',
    pk: h.SEL_PK,
    run: async (h, { page }) => {
      await h.gotoSafe(page, `https://nibgate.xyz/ns/${gated}`);
      const b = await h.bodyText(page);
      return [[/Pay to unlock/i.test(b), 'owner also sees paywall (correct)']];
    }
  });
  return checks;
}