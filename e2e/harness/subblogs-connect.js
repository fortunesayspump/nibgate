const mm = require('./mm');
async function main() {
  const { context, extensionId } = await mm.launch();
  const home0 = await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(home0);
  for (const p of context.pages()) { if (!p.url().includes('localhost')) await p.close().catch(()=>{}); }
  const sub = await context.newPage();
  sub.setDefaultTimeout(20000);
  // subblogs frontend 3002 — a paid post
  await sub.goto('http://localhost:3002/video/synthesizer-comparison', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sub.waitForTimeout(5000);
  console.log('SUB:', ((await sub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,'|').slice(0,300));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
