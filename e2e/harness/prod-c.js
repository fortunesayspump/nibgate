// Phase C: hold-to-pay on the paid post. Capture full request log (incl DNS failures) + wallet sign.
const fs = require("fs");
const L = require("./prod-lib.js");
const STATE = "../scratch/prod-state.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const PAID = state.posts.find(p => p.access === "paid");
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-c.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const orig = wallet.request.bind(wallet);
  wallet.request = async (req) => {
    const brief = { method: req.method, keys: req.params?.[0] && typeof req.params?.[0] === "object" ? Object.keys(req.params[0]) : null };
    log(`[walletreq] ${JSON.stringify(brief)}`);
    if (req.method.toLowerCase() === "eth_sign" || req.method.toLowerCase().includes("typed")) {
      const td = req.params?.[0]?.signTypedData || {};
      log(`  typed domain: ${JSON.stringify(td.domain)}`);
      const msg = td.message || {};
      if (msg.Transfer) log(`  Transfer: ${JSON.stringify(msg.Transfer).slice(0, 240)}`);
      if (msg.token || msg.from) log(`  msg: token=${msg.token} from=${msg.from} to=${msg.to} value=${msg.value}`);
    }
    if (req.method === "eth_sendTransaction") {
      log(`  sendTransaction to=${req.params?.[0]?.to} value=${req.params?.[0]?.value} data=${(req.params?.[0]?.data||"").slice(0,50)}`);
    }
    let r;
    try { r = await orig(req); log(`  -> ok ${String(r).slice(0, 40)}`); }
    catch (e) { log(`  -> ERR ${e.shortMessage || e.message?.slice(0, 120)}`); throw e; }
    return r;
  };
  await L.install({ page, wallet });

  page.on("response", async (res) => {
    const url = res.url();
    if (/api\.nibgate|circle|gateway|arc\.network|arc\.io/.test(url) && !/\.(js|css|png|svg|ico|woff)/.test(url)) {
      let body = "";
      try { body = (await res.text()).slice(0, 300); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 150)} ${body.slice(0, 260)}`);
    }
  });
  page.on("requestfailed", (r) => {
    log(`[reqfail] ${r.url().slice(0, 160)} ${r.failure()?.errorText}`);
  });

  await page.goto(`https://nibgate.xyz/ns/${PAID.slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  // connect (mock)
  if (!(await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count())) {
    await page.getByText(/connect wallet/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    const mockRow = page.getByText(/mock wallet/i).first();
    if (await mockRow.count()) await mockRow.click().catch(() => {});
    await page.waitForTimeout(1800);
    if (await page.getByText(/sign the message/i).count()) await page.getByRole("button", { name: /sign with wallet/i }).click();
    await page.waitForTimeout(3000);
  } else {
    log("already connected");
  }
  log("GATE BODY:", (await L.bodyText(page)).slice(0, 400));

  // HOLD the "Hold to pay" CTA (~1.2s)
  const hold = page.getByText("Hold to pay", { exact: false }).first();
  if (await hold.count()) {
    log("=== HOLDING 'Hold to pay' ===");
    const box = await hold.boundingBox();
    if (box) {
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      for (let i = 0; i < 3; i++) {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(600);
        const done = await page.getByText(/unlocked|receipt|content/i).count();
        if (done) { log("unlock might be progressing..."); }
        await page.mouse.up();
        await page.waitForTimeout(1500);
        const bodyAfter = await page.locator("body").innerText();
        if (bodyAfter.includes("paid post") || /Succes|receipt|Content|Secrets/i.test(bodyAfter)) { log("AFTER HOLD 1:", bodyAfter.slice(0, 500)); break; }
        else log(`hold attempt ${i + 1}: no change. body:`, bodyAfter.slice(0, 300));
        await page.waitForTimeout(800);
      }
    }
  } else log("no 'Hold to pay' element found");

  await page.waitForTimeout(1500);
  log("\nFINAL BODY:", (await L.bodyText(page)).slice(0, 600));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });