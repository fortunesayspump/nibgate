const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(5000);
  const body = ((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|');
  console.log('HUB:', body.slice(0,250));
  // try session endpoints via the frontend proxy
  for (const ep of ['/api/auth/session','/api/auth/me','/auth/session']) {
    try {
      const r = await hub.request.get('http://localhost:3001' + ep);
      console.log(ep, r.status(), (await r.text()).slice(0,100));
    } catch (e) { console.log(ep, 'err', e.message.slice(0,60)); }
  }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
