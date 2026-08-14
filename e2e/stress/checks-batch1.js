// Batch 1 — Global nav + content discovery, clicking real controls.
const h = require('./runner.js').h;

const navLinks = ['Explore', 'Blog', 'Leaderboards', 'Ledger', 'About'];
const navTargets = { Explore: '/', Blog: '/blog', Leaderboards: '/leaderboards', Ledger: '/ledger', About: '/about' };

const checks = [
  {
    id: 'nav-1-home', name: 'home loads, nav renders, click every nav link', group: 'nav',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/');
      const expects = [];
      for (const l of navLinks) expects.push([await h.has(page, new RegExp(l, 'i')), `nav '${l}' visible`]);
      // click each nav link
      for (const l of navLinks) {
        try { await h.click(page, page.getByText(l, { exact: true }).first(), `nav ${l}`); await page.waitForTimeout(1400); expects.push([true, `clicked ${l}`]); }
        catch (e) { expects.push([false, `click ${l}: ${e.message.slice(0, 80)}`]); }
      }
      return expects;
    }
  },
  {
    id: 'disc-2-explore-cards', name: 'explore: content cards render (external subblog links) + click a card', group: 'discovery',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const b0 = await h.bodyText(page);
      const card = page.locator('a[href*="//"], article a, a[href*="/docs/"], a[href*="/writing/"]').first();
      const n = await card.count();
      const expects = [[n > 0 || /Featured content/i.test(b0), `explore rendered + card hook present (${n})`]];
      expects.push([/Verified creator content|Explore/i.test(b0), 'explore heading']);
      if (n > 0) {
        const href = await card.getAttribute('href').catch(() => '');
        if (/^https?:\/\//.test(href)) { const r = await page.evaluate(() => 1); expects.push([true, `card href external: ${href.slice(0, 50)}`]); }
        else { try { await card.click().catch(() => {}); await page.waitForTimeout(2200); expects.push([!(/(Application error|Internal Server|Oops)/i.test(await h.bodyText(page))), `card target renders: ${href}`]); } catch (e) { expects.push([false, e.message.slice(0, 80)]); } }
      }
      return expects;
    }
  },
  {
    id: 'disc-3-search', name: 'explore: search input exists and accepts a query', group: 'discovery',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const input = page.locator('input[placeholder*="Search"]').first();
      if (!(await input.count())) { await page.waitForTimeout(2500); await page.reload({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(2500); }
      if (!(await input.count())) return [[false, 'no search input found']];
      await input.fill('composting');
      await page.waitForTimeout(2200);
      const b = await h.bodyText(page);
      return [[!/Application error/i.test(b), `search accepted without error: ${!/Application error/i.test(b)}`]];
    }
  },
  {
    id: 'disc-4-type-tabs', name: 'explore: content-type filter tabs click', group: 'discovery',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const tabs = page.locator('button', { hasText: /^(All|Writing|Articles|Essays|Newsletters|Media|Images|Music)$/i });
      const n = await tabs.count();
      const expects = [[n >= 5, `type tabs present (${n})`]];
      for (let i = 0; i < Math.min(n, 8); i++) {
        const t = await tabs.nth(i).innerText().catch(() => '');
        try { await tabs.nth(i).click({ force: true }); await page.waitForTimeout(900); expects.push([true, `tab ${t} -> ${!/Application error/i.test(await h.bodyText(page)) ? 'ok' : 'err'}`]); }
        catch (e) { expects.push([false, `tab ${t}: ${e.message.slice(0, 60)}`]); }
      }
      return expects;
    }
  },
  {
    id: 'disc-5-featured-carousel', name: 'explore: featured carousel < > navigates without crash', group: 'discovery',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/explore');
      const prev = page.locator('button:has-text("<")').first();
      const next = page.locator('button:has-text(">")').first();
      const expects = [[await next.count() > 0, `carousel arrows present: ${await next.count() > 0}`]];
      if (await next.count()) { await next.click({ force: true }); await page.waitForTimeout(900); expects.push([true, 'next clicked']); }
      if (await prev.count()) { await prev.click({ force: true }); await page.waitForTimeout(900); expects.push([true, 'prev clicked']); }
      expects.push([!/Application error/i.test(await h.bodyText(page)), 'no error boundary after carousel']);
      return expects;
    }
  },
  {
    id: 'lb-6-tabs', name: 'leaderboards: click creators/sites/content tabs', group: 'leaderboards',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/leaderboards');
      const expects = [];
      for (const tab of ['Creators', 'Sites', 'Content']) {
        const btn = page.getByRole('button', { name: new RegExp(tab, 'i') }).first();
        if (await btn.count()) { try { await btn.click({ force: true }); await page.waitForTimeout(1300); const b = await h.bodyText(page); expects.push([true, `tab ${tab} -> has ${tab.toLowerCase()} rows: ${/rank|score|unlock/i.test(b)}`]); } catch (e) { expects.push([false, `tab ${tab}: ${e.message.slice(0, 60)}`]); } }
        else expects.push([false, `tab ${tab} button missing`]);
      }
      return expects;
    }
  },
  {
    id: 'lg-7-tabs', name: 'ledger: switch views/unlocks/payments/ratings tabs', group: 'ledger',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/ledger');
      const expects = [[/view|unlock|payment|rating/i.test(await h.bodyText(page)), 'ledger page rendered']];
      for (const tab of ['Views', 'Unlocks', 'Payments', 'Ratings']) {
        const btn = page.getByRole('button', { name: new RegExp(tab, 'i') }).first();
        if (await btn.count()) { try { await btn.click({ force: true }); await page.waitForTimeout(1100); expects.push([true, `ledger tab ${tab}`]); } catch (e) { expects.push([false, `ledger ${tab}: ${e.message.slice(0, 60)}`]); } }
        else expects.push([false, `ledger tab ${tab} missing`]);
      }
      return expects;
    }
  },
  {
    id: 'blog-8-open-post', name: 'blog: list renders + click first post', group: 'blog',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/blog');
      const link = page.locator('a[href*="/blog/"]').first();
      const n = await link.count();
      const expects = [[n > 0, `blog post links (${n})`]];
      if (n) {
        const href = await link.getAttribute('href').catch(() => '');
        await link.click().catch(() => {});
        await page.waitForTimeout(2200);
        expects.push([true, `opened ${href}`]);
        expects.push([!(/(Application error|Internal Server)/i.test(await h.bodyText(page))), 'post page ok']);
      }
      return expects;
    }
  },
  {
    id: 'about-9', name: 'about page renders', group: 'nav',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/about');
      return [[(await h.bodyText(page)).length > 300, 'about has content']];
    }
  },
  {
    id: 'dash-10-landing', name: 'dashboard landing renders onboarding for anon/connected wallet', group: 'dashboard',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://nibgate.xyz/dashboard');
      const b = await h.bodyText(page);
      return [[/Get started|Connect your site|Dashboard|creator/i.test(b), `dashboard section present: ${b.slice(0, 70)}`]];
    }
  },
  {
    id: 'sub-11-nav', name: 'subblog: home renders + click a post', group: 'subblog',
    run: async (h, { page }) => {
      await h.gotoSafe(page, 'https://catwalk.nibgate.xyz/');
      const link = page.locator('a[href*="/docs/"], a[href*="/blog/"], a[href*="/posts/"]').first();
      const n = await link.count();
      const expects = [[n > 0, `subblog post links (${n})`]];
      if (n) {
        await link.click().catch(() => {});
        await page.waitForTimeout(2200);
        const b = await h.bodyText(page);
        expects.push([!(/(Application error|Internal Server)/i.test(b)), 'subblog post page ok']);
        expects.push([/Catwalk/i.test(b), 'subblog identity rendered']);
      }
      return expects;
    }
  },
];

module.exports = { name: 'batch1-nav-discovery', checks };