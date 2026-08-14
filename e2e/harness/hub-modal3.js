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
  await hub.waitForTimeout(3000);
  const modal = hub.locator('w3m-modal');
  // text within modal
  console.log('modal text:', (await modal.innerText().catch(()=>'')).replace(/\s+/g,'|').slice(0,400));
  const btns = modal.locator('button, [role="button"]'); const nb = await btns.count();
  console.log('--- modal buttons:', nb, '---');
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
    if (t) console.log(i, '::', t);
  }
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
