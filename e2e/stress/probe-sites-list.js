const { install, connectSellerFlow, bodyText, SEL_PK } = require('../harness/prod-lib.js');
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
  const r = await ctx.request.get('https://api.nibgate.xyz/api/hub/sites');
  const j = await r.json().catch(() => ({}));
  console.log('sites:', JSON.stringify(j));
  const junk = (j.websites || []).filter((w) => /not_a_domain|E2E|stress|probe|Lifecycle|!!!/i.test((w.name || '') + ' ' + (w.domain || '')));
  console.log('junk sites:', JSON.stringify(junk));
  for (const w of junk) {
    const d = await ctx.request.delete('https://api.nibgate.xyz/api/hub/sites/' + w.id);
    console.log('deleted', w.id, d.status());
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
