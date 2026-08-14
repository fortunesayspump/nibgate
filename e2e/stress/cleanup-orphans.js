const { install, connectSellerFlow, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');
const ORPHANS = ['FVbtY4n5', 'FBNHG7JA', 'UntaiXSK', '5GxtmxgP', 'hftQYdWL', 'C82sg1N3'];
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 's', log: () => {} });
  for (const s of ORPHANS) {
    const r = await ctx.request.get(`https://api.nibgate.xyz/api/nibshare/${s}/meta`).then((x) => x.status());
    if (r === 200) { const d = await ctx.request.delete('https://api.nibgate.xyz/api/nibshare/' + s); console.log(s, 'meta', r, 'deleted', d.status()); }
    else console.log(s, 'meta', r, 'skip');
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
