const mm = require('./mm');

async function main() {
  const { context, extensionId } = await mm.launch();
  await mm.homePage(context, extensionId);
  await mm.ensureMainWallet(context.pages()[0]).catch(()=>{});

  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);

  // listen for new pages (MetaMask popup)
  context.on('page', (p) => console.log('NEW PAGE:', p.url()));

  // click Connect wallet
  const connectBtn = hub.locator('button:has-text("Connect wallet")').first();
  if (await connectBtn.count()) { await connectBtn.click(); await hub.waitForTimeout(2000); }

  // dump hub body after click (appkit modal?)
  console.log('--- hub after connect click ---');
  console.log(((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,' ').slice(0,400));

  // list pages now
  const pages = context.pages();
  console.log('--- pages ---');
  for (const p of pages) console.log('  ', p.url());
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });