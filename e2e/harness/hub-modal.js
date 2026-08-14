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
  console.log('--- hub body after click ---');
  console.log(((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,500));
  console.log('--- hub iframes:', await hub.locator('iframe').count());
  const frames = hub.frames();
  for (const f of frames) console.log('  frame:', f.url().slice(0,100));
  await context.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
