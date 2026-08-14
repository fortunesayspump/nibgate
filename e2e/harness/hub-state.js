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
  console.log('HUB:', body.slice(0,400));
  // check for connect / disconnect / wallet button
  const btns = hub.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
    if (t) list.push(i + ' :: ' + t);
  }
  console.log('buttons:', list.join(' | '));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
