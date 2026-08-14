// Phase E: trigger hold via in-page PointerEvent (bubbles to React root handler), monitor 20s.
const fs = require("fs");
const L = require("./prod-lib.js");
const STATE = "../scratch/prod-state.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const PAID = state.posts.find(p => p.access === "paid");
const URL = `https://nibgate.xyz/ns/${PAID.slug}`;
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-e.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };

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
      if (m.Transfer) log(`  Transfer=${JSON.stringify(m.Transfer).slice(0, 300)}`);
      if (m.token) log(`  token=${m.token} from=${m.from} to=${m.to} value=${m.value}`);
    }
    if (req.method === "eth_sendTransaction") log(`  send to=${req.params?.[0]?.to} val=${req.params?.[0]?.value} data=${(req.params?.[0]?.data||"").slice(0,50)}`);
    let r;
    try { r = await orig(req); log(`  [ok] ${String(r).slice(0, 30)}`); }
    catch (e) { log(`  [ERR] ${e.shortMessage || e.message?.slice(0, 140)}`); throw e; }
    return r;
  };
  await L.install({ page, wallet });
  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 250)}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api\.nibgate|circle|gateway|arc\.network/.test(url) && !/\.(js|css|png|svg|ico|woff)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 220); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 130)} ${b.slice(0, 220)}`);
    }
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);
  for (let i = 0; i < 5; i++) {
    if (await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count()) break;
    if (await page.getByText(/sign the message/i).count()) { await page.getByRole("button", { name: /sign with wallet/i }).click(); }
    else {
      const cb = page.getByText(/connect wallet/i).first();
      if (await cb.count()) { await cb.click().catch(() => {}); await page.waitForTimeout(900); }
      const mr = page.getByText(/mock wallet/i).first();
      if (await mr.count()) { await mr.click().catch(() => {}); }
    }
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1200);
  log("GATE:", (await page.locator("body").innerText()).slice(0, 300).replace(/\n/g, " | "));

  // Detect the hold CTA and dispatch real pointer events in-page
  const ctaInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => /hold to pay|unlock/i.test(b.textContent || ""));
    if (!btn) return null;
    const wrapper = btn.closest("div[style]");
    return { wrapperTag: wrapper?.tagName, hasPtrDown: !!wrapper?._ptr, text: (btn.textContent||"").trim() };
  }).catch((e) => log("[eval] err", e.message));
  log("CTA:", JSON.stringify(ctaInfo));

  const hadCta = await page.getByText(/hold to pay/i).count();
  log(`hold-to-pay count=${hadCta}`);
  if (!hadCta) {
    // maybe free-unlock button
    const freeBtn = page.getByText(/unlock for free/i);
    log(`free-unlock count=${await freeBtn.count()}`);
  }
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => /hold to pay/i.test(b.textContent || "")) || btns.find(b => /unlock for free/i.test(b.textContent || ""));
    if (!btn) { window.__triggerResult = "no cta"; return; }
    const wrapper = btn.closest("div");
    const down = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", buttons: 1, pointerId: 1, isPrimary: true });
    const up = new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", buttons: 0, pointerId: 1, isPrimary: true });
    wrapper.dispatchEvent(down);
    window.__triggerResult = "dispatched down";
    setTimeout(() => { wrapper.dispatchEvent(up); window.__triggerResult = "dispatched up"; }, 2200);
  });
  log("triggered in-page hold (2200ms)");

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const len = await page.locator("body").innerText().catch(() => "");
    const t = len.slice(0, 260).replace(/\n/g, " | ");
    log(`t+${(i + 1) * 2}s bodylen=${len.length} :: ${t}`);
    if (len.includes("paid post") && !/Hold to pay/.test(len)) { log("** CONTENT VISIBLE (unlocked) **"); break; }
  }
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });