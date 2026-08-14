const { chromium } = require('playwright');
const path = require('node:path');
const EXT = path.resolve('/tmp/opencode/e2e/extensions/metamask');
const PROFILE = '/tmp/opencode/e2e/mm-profile';
async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chromium', headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-component-extensions-with-background-pages'],
    timeout: 60000,
  });
  const start = Date.now(); let worker = null;
  while (Date.now() - start < 30000) { worker = context.serviceWorkers().find((w) => w.url().includes('service-worker.js')); if (worker) break; await new Promise((r) => setTimeout(r, 500)); }
  const extensionId = new URL(worker.url()).host;
  const home = await context.newPage();
  home.setDefaultTimeout(10000);
  await home.goto(`chrome-extension://${extensionId}/home.html`, { timeout: 30000 });
  await home.waitForTimeout(3000);
  const pw = home.locator('input[type="password"]').first();
  if (await pw.count()) { await pw.fill('TestWallet123!'); await home.locator('[data-testid="unlock-submit"]').first().click(); await home.waitForTimeout(2000); }
  const pl = home.locator('[data-testid="passkey-maybe-later-button"]').first();
  if (await pl.count()) { await pl.click(); await home.waitForTimeout(1500); }
  const dumpBtns = async (label) => {
    const btns = home.locator('button');
    const nb = await btns.count();
    const list = [];
    for (let i = 0; i < nb; i++) {
      const t = ((await btns.nth(i).textContent().catch(()=>''))||'').trim().replace(/\s+/g,' ').slice(0,40);
      const tid = await btns.nth(i).getAttribute('data-testid').catch(()=>null);
      if (t || tid) list.push((tid||'') + ' :: ' + t);
    }
    console.log('---', label, '---'); console.log(list.join('\n'));
  };
  await dumpBtns('start');
  for (let i = 0; i < 6; i++) {
    const cont = home.locator('[data-testid="recovery-phrase-continue"]').first();
    if (await cont.count()) {
      const box = await cont.boundingBox();
      await home.mouse.click(box.x + box.width/2, box.y + box.height/2);
      await home.waitForTimeout(1200);
      await dumpBtns('after-continue-' + i);
    } else break;
  }
  await context.close(); process.exit(0);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
