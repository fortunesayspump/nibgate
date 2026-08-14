const mm = require('./mm');
async function dump(page, label, opts = {}) {
  const txt = ((await page.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,500);
  console.log('---', label, '---', page.url());
  console.log('  ', txt.slice(0,400));
  const btns = page.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
    const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
    if (t || tid) list.push((tid||'')+'::'+t);
  }
  console.log('  btns:', list.slice(0,25).join(' | ')||'(none)');
}
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  console.log('wallet home body:', await mm.body(home0));
  for (const p of context.pages()) { if (!p.url().includes('nibgate.xyz') && !p.url().includes('chrome-extension')) await p.close().catch(()=>{}); }
  const hub = await context.newPage();
  hub.setDefaultTimeout(25000);
  await hub.goto('https://nibgate.xyz/share/mine', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await hub.waitForTimeout(8000);
  await dump(hub, 'prod share/mine');
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
