// Rebuilds the canonical share fixtures (they were accidentally revoked during a
// cleanup run that matched /E2E/ in their titles) and writes fresh slugs to
// stress/fixtures.json. Run: node stress/setup-fixtures.js
const fs = require('fs');
const path = require('path');
const { install, connectSellerFlow, SEL_PK, BUY_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');

const BUY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const API = 'https://api.nibgate.xyz/api/nibshare';

const FIXTURES = {
  free: { title: 'E2E Free Alpha', content: 'Free post body used by the stress battery.', price: '0', publicAccess: true, contentType: 'article', status: 'active' },
  paid: { title: 'E2E Paid Playbook', content: 'Premium playbook body — paid unlock.', price: '5', publicAccess: true, contentType: 'article', status: 'active' },
  wlfree: { title: 'E2E Whitelist Free', content: 'Whitelist free tier body.', price: '9', publicAccess: true, contentType: 'article', status: 'active', whitelist: [BUY], whitelistPrice: '0' },
  wldrop: { title: 'E2E Whitelist Drop', content: 'Whitelist drop tier body.', price: '9', publicAccess: true, contentType: 'article', status: 'active', whitelist: [BUY], whitelistPrice: '2' },
  invite: { title: 'E2E Invite Only', content: 'Invite-only body.', price: '12', publicAccess: false, contentType: 'article', status: 'active', whitelist: [] },
  custom: { title: 'E2E Matrix Custom Tier', content: 'Custom whitelist tier body.', price: '12', publicAccess: true, contentType: 'article', status: 'active', whitelist: [BUY], whitelistPrice: '2' },
  draft: { title: 'E2E Matrix Draft4', content: 'Draft body.', price: '0', publicAccess: true, contentType: 'article', status: 'draft' },
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });
  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(2000);
  await connectSellerFlow(page, { label: 's', log: () => {} });

  const out = {};
  for (const [key, f] of Object.entries(FIXTURES)) {
    const r = await ctx.request.post(API, { data: f });
    const j = await r.json().catch(() => ({}));
    if (!j.slug) { console.error(`FAIL ${key}:`, r.status(), JSON.stringify(j).slice(0, 160)); process.exit(1); }
    out[key] = { slug: j.slug, title: f.title };
    console.log(`created ${key} -> ${j.slug} (${r.status()})`);
  }
  fs.writeFileSync(path.join(__dirname, 'fixtures.json'), JSON.stringify(out, null, 2));
  console.log('wrote stress/fixtures.json');
  await browser.close();
})().catch((e) => { console.error('SETUP FAIL', e); process.exit(1); });