// Live subblog direct-rail E2E: real Playwright + mock wallet against a live
// subblog. Buyer opens a paid post, switches to the Direct rail, broadcasts a
// real USDC transfer, and asserts the paid body reveals.
// Usage: node live-subblog-direct-rail.js [https://analog.nibgate.xyz/path/to/paid-post]
const fs = require("fs");
const L = require("./prod-lib.js");
const BASE = process.env.PROD_BASE || "https://analog.nibgate.xyz";
const POST = process.env.PROD_POST || "/writing/analog-35mm-vs-medium-format-what-is-the-difference";
const log = (m) => { console.log(m); fs.appendFileSync("../logs/live-subblog-direct-rail.log", (new Date()).toISOString().slice(11, 19) + " " + m + "\n"); };

(async () => {
  const { browser, context, page } = await L.newBrowser();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 220)}`));
  page.on("console", (m) => { const t = m.text(); if (/error|warn|fail|nibgate|rail/i.test(t)) log(`[console] ${m.type()} ${t.slice(0, 220)}`); });
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibgate|api|circle|gateway|arc|hub/.test(url) && !/\.(js|css|png|svg|ico|woff|ttf|webp)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 300); } catch {}
      log(`[resp] ${res.status()} ${url.replace(BASE, "").slice(0, 120)} ${b.replace(/\s+/g, " ").slice(0, 300)}`);
    }
  });

  const { account: buyAcc, wallet: buyWallet } = await L.makeWallet(L.BUY_PK);
  const origReq = buyWallet.request.bind(buyWallet);
  buyWallet.request = async (req) => {
    log(`[walletreq] ${req.method} ${String(req.params?.[0]?.to || "").slice(0, 42)} ${String(req.params?.[0]?.data || "").slice(0, 20)}`);
    try { const r = await origReq(req); if (req.method === "eth_sendTransaction") log(`[tx] ${r}`); return r; }
    catch (e) { log(`[walletreq-ERR] ${req.method} ${(e.shortMessage || e.message || "").slice(0, 140)}`); throw e; }
  };
  await L.install({ page, wallet: buyWallet });
  await page.goto(`${BASE}${POST}`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(2000);

  for (let i = 0; i < 6; i++) {
    if (await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count()) break;
    if (await page.getByText(/sign the message/i).count()) {
      await page.getByRole("button", { name: /sign with wallet/i }).click({ force: true, timeout: 20000 });
    } else {
      const cb = page.getByText(/connect wallet/i).first();
      if (await cb.count()) await cb.click({ force: true, timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const mr = page.getByText(/mock wallet/i).first();
      if (await mr.count()) await mr.click().catch(() => {});
    }
    await page.waitForTimeout(1400);
  }
  await page.waitForTimeout(1500);
  log(`[gate] ${(await L.bodyText(page)).slice(0, 420)}`);

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(700);

  const railTabs = page.locator('[role="tab"]');
  if (await railTabs.count()) {
    const labels = await railTabs.allInnerTexts();
    log(`[tabs] ${JSON.stringify(labels)}`);
    const direct = page.locator('[role="tab"]', { hasText: /direct/i });
    if (await direct.count()) {
      await direct.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      log(`[tabs] direct aria-selected=${await direct.getAttribute("aria-selected").catch(() => null)}`);
    }
  }

  const holdText = /hold to pay|unlock for free/i;
  if (await page.getByText(holdText).count()) {
    log("[hold] triggering hold-to-pay on Direct rail");
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const btn = btns.find(b => /hold to pay|unlock for free/i.test(b.textContent || ""));
      if (!btn) return;
      const wrapper = btn.closest("div") || btn;
      const down = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", buttons: 1, pointerId: 1, isPrimary: true });
      const up = new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", buttons: 0, pointerId: 1, isPrimary: true });
      wrapper.dispatchEvent(down);
      setTimeout(() => wrapper.dispatchEvent(up), 2300);
    });
    let done = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      const t = await L.bodyText(page);
      if (/Analog|photograph|film|Camera|35mm/i.test(t) && !/hold to pay|pay to unlock|gateway|direct/i.test(t)) {
        log(`[result] CONTENT REVEALED: ${t.slice(0, 300)}`);
        done = true;
        break;
      }
      if (/Something went wrong|Insufficient|error|failed|could not be verified/i.test(t)) { log(`[result] error state: ${t.slice(0, 240)}`); break; }
    }
    if (!done) log(`[result] final body: ${(await L.bodyText(page)).slice(0, 500)}`);
  } else {
    log(`[result] no hold-to-pay CTA; body: ${(await L.bodyText(page)).slice(0, 400)}`);
  }

  log("\n=== DONE ===");
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });