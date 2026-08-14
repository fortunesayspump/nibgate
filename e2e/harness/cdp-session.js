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
  // cookies
  const cookies = await context.cookies();
  for (const c of cookies) console.log('cookie:', c.name, '=', (c.value||'').slice(0,60), 'domain', c.domain);
  // localStorage keys for session
  const keys = ['auth_session','nibshare.auth','nibgate.auth','nibgate.session','appkit.connected'];
  for (const k of keys) {
    try {
      const v = await hub.evaluate((kk) => localStorage.getItem(kk), k);
      if (v) console.log('LS', k, '=', v.slice(0,120));
    } catch (e) {}
  }
  // try fetching nonce endpoint via fetch in page context
  try {
    const r = await hub.evaluate(async () => {
      const res = await fetch('/api/auth/nonce', { credentials: 'include' });
      return res.status + ' ' + (await res.text()).slice(0,80);
    });
    console.log('/api/auth/nonce via page fetch:', r);
  } catch(e) { console.log('nonce eval err', e.message.slice(0,60)); }
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
