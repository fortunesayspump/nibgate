const mm = require('./mm');

const TEST_PK = mm.TEST_PK;

async function main() {
  const { context, extensionId } = await mm.launch();
  await mm.homePage(context, extensionId); // boot wallet, ensure unlocked
  await mm.ensureMainWallet(context.pages()[0]).catch(()=>{});

  // Now open the hub frontend
  const hub = await context.newPage();
  hub.setDefaultTimeout(15000);
  await hub.goto('http://localhost:3001/ns/bgYyjNKc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await hub.waitForTimeout(4000);

  // dump what's on the page (buttons with text)
  const btns = hub.locator('button'); const nb = await btns.count(); const list = [];
  for (let i = 0; i < nb; i++) {
    const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,50);
    if (t) list.push(i + ' :: ' + t);
  }
  console.log('--- hub buttons ---');
  console.log(list.slice(0,30).join('\n'));
  console.log('--- body snippet ---');
  console.log(((await hub.locator('body').innerText().catch(()=>''))||'').replace(/\s+/g,' ').slice(0,300));
  await context.close();
  process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });