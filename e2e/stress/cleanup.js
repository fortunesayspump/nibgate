const { install, connectSellerFlow, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 's', log: () => {} });
  const r = await ctx.request.get('https://api.nibgate.xyz/api/nibshare/mine');
  const j = await r.json().catch(() => ({}));
  const shares = j.shares || [];
  const junk = shares.filter((s) => /E2E|Lifecycle|bogus|Probe/i.test(s.title || ''));
  console.log('mine:', shares.length, '| junk:', junk.map((s) => `${s.slug}:${s.title.slice(0, 40)}:${s.status}`).join(' | '));
  for (const s of junk) {
    const d = await ctx.request.delete('https://api.nibgate.xyz/api/nibshare/' + s.slug);
    console.log('  deleted', s.slug, d.status());
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
