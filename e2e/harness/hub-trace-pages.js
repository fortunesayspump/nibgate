const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  context.on('page', (p) => { p.on('domcontentloaded', () => console.log('  [page loaded]', p.url())); });
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  console.log('wallet ready; pages:', context.pages().map(p=>p.url()).join(' | '));

  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  console.log('hub loaded; pages:', context.pages().map(p=>p.url()).join(' | '));

  // poll URL changes for 12s
  const seen = new Set(context.pages().map(p=>p.url().split('#')[1]||''));
  for (let t = 0; t < 24; t++) {
    await hub.waitForTimeout(500);
    for (const p of context.pages()) {
      const path = p.url();
      if (!seen.has(path)) { seen.add(path); console.log('  [poll]', path); }
    }
  }

  // click connect right at the end
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(600);
  console.log('after connect click; pages:', context.pages().map(p=>p.url()).join(' | '));
  for (let t = 0; t < 30; t++) {
    await hub.waitForTimeout(600);
    for (const p of context.pages()) {
      const path = p.url();
      if (!seen.has(path)) { seen.add(path); console.log('  [poll]', path); }
    }
  }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
