// REAL funded purchase: buyer (25 USDC) buys E2E Paid Playbook ($5) on production.
const fs = require("fs");
const L = require("./prod-lib.js");
const state = JSON.parse(fs.readFileSync("../scratch/prod-state.json", "utf8"));
const PAID = state.posts.find(p => p.access === "paid");
const URL = `https://nibgate.xyz/ns/${PAID.slug}`;
const log = (m) => { console.log(m); fs.appendFileSync("../logs/real-purchase.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const orig = wallet.request.bind(wallet);
  let signedTyped = 0;
  wallet.request = async (req) => {
    const method = String(req.method || "").toLowerCase();
    if (method === "eth_signtypeddata_v4") {
      const data = JSON.parse(req.params[1]);
      signedTyped++;
      const m = data.message || {};
      log(`[walletreq] eth_signTypedData_v4 domain=${JSON.stringify(data.domain)}`);
      if (Array.isArray(m.batch)) log(`  batch items=${m.batch.length} first=${JSON.stringify(m.batch[0]).slice(0, 340)}`);
      if (m.Transfer) log(`  Transfer=${JSON.stringify(m.Transfer).slice(0, 340)}`);
      const sig = await account.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message });
      log(`  -> EIP-712 signed (${sig.length} chars)`);
      return sig;
    }
    let r;
    try { r = await orig(req); }
    catch (e) { log(`  [walletreq:ERR] ${req.method} ${e.shortMessage || e.message?.slice(0, 120)}`); throw e; }
    return r;
  };
  await L.install({ page, wallet });
  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 200)}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api\.nibgate|circle|gateway/.test(url) && !/\.(js|css|png|svg|ico|woff)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 320); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 120)} ${b.slice(0, 320)}`);
    }
  });

  log(`BUYER ${account.address} buying ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) {
    if (await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count()) break;
    if (await page.getByText(/sign the message/i).count()) await page.getByRole("button", { name: /sign with wallet/i }).click();
    else {
      const cb = page.getByText(/connect wallet/i).first();
      if (await cb.count()) { await cb.click().catch(() => {}); await page.waitForTimeout(900); }
      const mr = page.getByText(/mock wallet/i).first();
      if (await mr.count()) { await mr.click().catch(() => {}); }
    }
    await page.waitForTimeout(1400);
  }
  await page.waitForTimeout(1500);
  log("GATE:", (await L.bodyText(page)).slice(0, 340));

  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => /hold to pay/i.test(b.textContent || ""));
    if (!btn) return;
    const wrapper = btn.closest("div");
    wrapper.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", buttons: 1, pointerId: 1, isPrimary: true }));
    setTimeout(() => wrapper.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", buttons: 0, pointerId: 1, isPrimary: true })), 2200);
  });
  log("[hold-to-pay fired]");

  let unlocked = false;
  for (let i = 0; i < 22; i++) {
    await page.waitForTimeout(2000);
    const t = await page.locator("body").innerText().catch(() => "");
    const tag = (i + 1) * 2;
    if (/Processing|Checking|Hold to pay/.test(t) && t.length > 150) log(`t+${tag}s ${t.split("\n").filter(l => l.trim()).slice(-4).join(" | ").slice(0, 200)}`);
    if (/secrets inside|paid post/.test(t) && !/Hold to pay|Pay to unlock/.test(t)) { log(`t+${tag}s ** CONTENT VISIBLE **: ${t.slice(0, 320)}`); unlocked = true; break; }
    if (/Something went wrong|error/i.test(t) && !/Pay to unlock/i.test(t)) { log(`t+${tag}s ERRORED: ${t.slice(0, 320)}`); break; }
  }
  log(`FINAL ${unlocked ? "UNLOCKED" : "NOT-UNLOCKED"} | typed-sign-count=${signedTyped}`);
  log("FINAL BODY:", (await L.bodyText(page)).slice(0, 500));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });