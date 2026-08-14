const mm = require('./mm');
(async () => {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);
  await hub.locator('button:has-text("Connect wallet")').first().click();
  await hub.waitForTimeout(2500);
  // click MetaMask in modal
  const mmBtn = hub.locator('w3m-modal button:has-text("MetaMask installed")').first();
  if (await mmBtn.count()) { await mmBtn.click(); console.log('clicked MetaMask'); }
  else { console.log('MetaMask button not found'); }
  // trace pages
  const seen = new Set();
  context.on('page', (p) => { p.on('domcontentloaded', () => console.log('[NEW PAGE]', p.url())); });
  for (const p of context.pages()) seen.add(p.url());
  for (let t = 0; t < 30; t++) {
    await hub.waitForTimeout(600);
    for (const p of context.pages()) { const u=p.url(); if(!seen.has(u)){seen.add(u); console.log('[poll]', u);} }
  }
  console.log('pages:', context.pages().map(p=>p.url()).join(' | '));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
