// Phase H: reproduce whitelist-FREE unlock with proper SIWE session; probe /access directly.
const fs = require("fs");
const L = require("./prod-lib.js");
const state = JSON.parse(fs.readFileSync("../scratch/prod-state.json", "utf8"));
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-h.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };
const WF = state.posts.find(p => p.access === "whitelist-free");
const PAID = state.posts.find(p => p.access === "paid");

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const orig = wallet.request.bind(wallet);
  let siweDone = false, typedReq = null;
  wallet.request = async (req) => {
    const method = String(req.method || "").toLowerCase();
    if (method === "personal_sign") { log(`[walletreq] personal_sign (SIWE)`); siweDone = true; }
    if (method === "eth_signtypeddata_v4") {
      const data = JSON.parse(req.params[1]);
      typedReq = data;
      log(`[walletreq] eth_signTypedData_v4 domain=${JSON.stringify(data.domain)}`);
      const sig = await account.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message });
      log(`  -> signed ${sig.length} chars`);
      return sig;
    }
    return orig(req);
  };
  await L.install({ page, wallet });
  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 200)}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api\.nibgate|circle|gateway/.test(url) && !/\.(js|css|png|svg|ico|woff)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 260); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 120)} ${b.slice(0, 260)}`);
    }
  });

  // Visit the whitelist-free post and CONNECT fully (with SIWE)
  await page.goto(`https://nibgate.xyz/ns/${WF.slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i++) {
    const connected = await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count();
    if (connected && siweDone) break;
    if (await page.getByText(/sign the message/i).count()) await page.getByRole("button", { name: /sign with wallet/i }).click();
    else {
      const cb = page.getByText(/connect wallet/i).first();
      if (await cb.count()) { await cb.click().catch(() => {}); await page.waitForTimeout(900); }
      const mr = page.getByText(/mock wallet/i).first();
      if (await mr.count()) { await mr.click().catch(() => {}); }
    }
    await page.waitForTimeout(1600);
  }
  log(`connected=${await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count()} siweDone=${siweDone}`);
  await page.waitForTimeout(1200);
  log(`GATE: ${(await L.bodyText(page)).slice(0, 350)}`);

  // Directly POST /access?wallet=... with session -> server response
  const r = await page.evaluate(async (slug) => {
    try {
      const res = await fetch(`/nibshare/${slug}/access?wallet=${"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"}`, { method: "GET" });
      return { status: res.status, body: (await res.text()).slice(0, 500) };
    } catch (e) { return { status: "ERR", body: e.message }; }
  }, WF.slug);
  log(`[direct /access free] ${JSON.stringify(r)}`);

  // Now trigger the "Unlock for free" button and watch
  log("[trigger Unlock for free]");
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find(b => /unlock for free/i.test(b.textContent || ""));
    if (!btn) { window.__f = "no cta"; return; }
    const wrapper = btn.closest("div");
    const down = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", buttons: 1, pointerId: 1, isPrimary: true });
    const up = new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", buttons: 0, pointerId: 1, isPrimary: true });
    wrapper.dispatchEvent(down);
    setTimeout(() => wrapper.dispatchEvent(up), 2200);
  });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const t = await L.bodyText(page);
    log(`t+${(i+1)*2}s bodylen=${t.length} :: ${t.slice(0, 200)}`);
    if (/Something went wrong|unauthorized|Error/i.test(t)) break;
    if (!/Hold to pay|Processing|Checking|Pay to unlock|Unlock for free|whitelist/i.test(t)) { log("   ** unlocked? **"); break; }
  }

  await browser.close();
  log("DONE");
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });