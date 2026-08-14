// Phase D: stable paid-unlock observation. Watch url/nav/pageerror; sustained hold.
const fs = require("fs");
const L = require("./prod-lib.js");
const STATE = "../scratch/prod-state.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const PAID = state.posts.find(p => p.access === "paid");
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-d.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };
const SLUG = PAID.slug;
const URL = `https://nibgate.xyz/ns/${SLUG}`;

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const orig = wallet.request.bind(wallet);
  wallet.request = async (req) => {
    log(`[walletreq] ${req.method}`);
    if ((req.method || "").toLowerCase().includes("typed")) {
      const td = req.params?.[0]?.signTypedData || {};
      log(`  domain=${JSON.stringify(td.domain)}`);
      const m = td.message || {};
      if (m.Transfer) log(`  Transfer=${JSON.stringify(m.Transfer).slice(0, 260)}`);
      if (m.token) log(`  token=${m.token} from=${m.from} to=${m.to} value=${m.value}`);
    }
    if (req.method === "eth_sendTransaction") log(`  send to=${req.params?.[0]?.to} val=${req.params?.[0]?.value}`);
    let r;
    try { r = await orig(req); log(`  [ok] ${String(r).slice(0, 30)}`); }
    catch (e) { log(`  [ERR] ${e.shortMessage || e.message?.slice(0, 120)}`); throw e; }
    return r;
  };
  await L.install({ page, wallet });

  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 200)}`));
  page.on("framenavigated", (f) => log(`[nav] ${f.url()}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api\.nibgate|circle|gateway/.test(url) && !/\.(js|css|png|svg|ico|woff)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 200); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 130)} ${b.slice(0, 200)}`);
    }
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);
  log(`landed url=${page.url()}  bodylen=${(await page.locator("body").innerText().catch(()=>"")).length}`);

  // connect + SIWE
  for (let i = 0; i < 4; i++) {
    const has = await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count().catch(() => 0);
    if (has) break;
    const siwe = await page.getByText(/sign the message/i).count().catch(() => 0);
    if (siwe) { await page.getByRole("button", { name: /sign with wallet/i }).click(); await page.waitForTimeout(2500); }
    else {
      const cb = page.getByText(/connect wallet/i).first();
      if (await cb.count()) { await cb.click().catch(() => {}); await page.waitForTimeout(1000); }
      const mr = page.getByText(/mock wallet/i).first();
      if (await mr.count()) { await mr.click().catch(() => {}); await page.waitForTimeout(2200); }
    }
    await page.waitForTimeout(1000);
  }
  log(`after connect url=${page.url()} bodylen=${(await page.locator("body").innerText().catch(()=>"")).length}`);
  log("GATE:", (await page.locator("body").innerText().catch(()=>"")).slice(0, 300).replace(/\n/g, " | "));

  const hold = page.getByText("Hold to pay", { exact: false }).first();
  log(`hold element count=${await hold.count().catch(()=>0)}`);
  if (await hold.count()) {
    const box = await hold.boundingBox();
    log(`hold box=${JSON.stringify(box)}`);
    if (box) {
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      log(`pointerdown`); await page.mouse.down();
      await page.waitForTimeout(2200);
      log(`pointerup`); await page.mouse.up();
      await page.waitForTimeout(4000);
    }
  }
  log(`after hold url=${page.url()} bodylen=${(await page.locator("body").innerText().catch(()=>"")).length}`);
  log("AFTER HOLD:", (await page.locator("body").innerText().catch(()=>"")).slice(0, 600).replace(/\n/g, " | "));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });