const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  console.log('wallet ready');
  // close ALL wallet/unlock/about:blank pages, keep nothing
  for (const p of context.pages()) {
    if (!p.url().includes('localhost')) { await p.close().catch(()=>{}); }
  }
  console.log('closed wallet pages; remaining:', context.pages().length);
  // now open hub
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  const seen = new Set();
  context.on('page', (p) => { p.on('domcontentloaded', () => console.log('[NEW PAGE]', p.url())); p.on('framenavigated', (f)=>console.log('[NAV]', p.url())); });
  for (const p of context.pages()) seen.add(p.url());
  await hub.locator('button:has-text("Connect wallet")').first().click();
  for (let t = 0; t < 30; t++) {
    await hub.waitForTimeout(600);
    for (const p of context.pages()) {
      const u = p.url();
      if (!seen.has(u)) { seen.add(u); console.log('[poll]', u); }
    }
  }
  console.log('pages now:', context.pages().map(p=>p.url()).join(' | '));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
