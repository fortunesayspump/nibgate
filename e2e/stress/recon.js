// DOM recon: dump structure of home/explore + /share form + a post gate so
// selectors in the stress checks match the real markup.
const { install, bodyText, SEL_PK } = require('../harness/prod-lib.js');
const { chromium } = require('playwright');

async function dump({ page, name, sel = 'button, select, input, a, [role="tab"], [role="button"]' }) {
  const items = await page.locator(sel).evaluateAll((els) => els.slice(0, 60).map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('role') || ''}][${e.getAttribute('href') || ''}] "${(e.innerText || e.value || e.placeholder || '').trim().slice(0, 40)}"`));
  console.log(`\n== ${name} == ${items.length} controls`);
  for (const it of items) console.log('  ', it);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  await install({ page, pk: SEL_PK });

  await page.goto('https://nibgate.xyz/', { waitUntil: 'commit' });
  await page.waitForTimeout(4000);
  await dump({ page, name: 'HOME' });

  await page.goto('https://nibgate.xyz/share', { waitUntil: 'commit' });
  await page.waitForTimeout(3500);
  await dump({ page, name: 'SHARE (pre-auth)' });

  // connect seller to see the form controls
  const { connectSellerFlow } = require('../harness/prod-lib.js');
  await connectSellerFlow(page, { label: 'recon', log: () => {} });
  await page.waitForTimeout(1500);
  await dump({ page, name: 'SHARE FORM (seller authed)' });
  // placeholders + select options detail
  const inputs = await page.locator('input, textarea, select').evaluateAll((els) => els.slice(0, 30).map((e) => ({ tag: e.tagName, ph: e.placeholder || '', val: e.value || '' })));
  console.log('\n== SHARE form inputs =='); for (const i of inputs) console.log('  ', JSON.stringify(i));
  const sels = await page.locator('select').evaluateAll((els) => els.map((e) => ({ options: [...e.options].slice(0, 12).map((o) => o.text), value: e.value })));
  console.log('\n== SHARE selects =='); for (const s of sels) console.log('  ', JSON.stringify(s));

  await page.goto('https://nibgate.xyz/ns/dR21SdTL', { waitUntil: 'commit' });
  await page.waitForTimeout(3000);
  await dump({ page, name: 'GATE (paid anon)', sel: 'button, a, input, [role="button"], [role="tab"]' });

  await browser.close();
})().catch((e) => { console.error('RECON FAIL', e); process.exit(1); });