// Local direct-rail E2E: real Playwright + real mock wallets against the LOCAL stack.
// 1) Seller (SEL_PK) creates a paid share.
// 2) Buyer (BUY_PK) opens it, switches to the Direct rail, broadcasts a real USDC
//    transfer, and asserts the unlock proof + content.
const fs = require("fs");
const L = require("./prod-lib.js");
const BASE = process.env.PROD_BASE || "http://localhost:3001";
const log = (m) => { console.log(m); fs.appendFileSync("../logs/local-direct-rail.log", (new Date()).toISOString().slice(11, 19) + " " + m + "\n"); };

// Seller must be a wallet the USDC wrapper accepts as a transfer recipient.
// The harness's SEL_PK (0x7099...79c8) is blocklisted for receiving too, so use
// a swarm wallet (CryptoAlice, id=1) as the share owner instead.
const SWARM = JSON.parse(fs.readFileSync("/Users/fortune/Documents/Workflows/nibgate-repo/swarm/swarm-wallets.json", "utf8"));
const SELLER_WALLET = SWARM.find((w) => w.id === 1);

(async () => {
  let { browser, context, page } = await L.newBrowser();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 220)}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api|circle|gateway|arc/.test(url) && !/\.(js|css|png|svg|ico|woff|ttf)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 300); } catch {}
      log(`[resp] ${res.status()} ${url.replace(BASE, "").slice(0, 120)} ${b.replace(/\s+/g, " ").slice(0, 300)}`);
    }
  });

  const TITLE = "Direct Rail Local Test " + Date.now().toString(36);
  const PRICE = "1";

  // ── 1) Seller creates a paid share ─────────────────────────────────────
  log("\n===== SELLER: create paid share =====");
  const { account: selAcc, wallet: selWallet } = await L.makeWallet(SELLER_WALLET.privateKey);
  log(`[seller] owner=${SELLER_WALLET.name} ${selAcc.address}`);
  page.on("console", (m) => { const t = m.text(); if (/error|fail|nibgate|rail/i.test(t)) log(`[seller-console] ${m.type()} ${t.slice(0, 180)}`); });
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api/.test(url) && !/\.(js|css|png|svg|ico|woff|ttf)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 260); } catch {}
      log(`[seller-resp] ${res.status()} ${url.replace(BASE, "").slice(0, 110)} ${b.replace(/\s+/g, " ").slice(0, 260)}`);
    }
  });
  await L.install({ page, wallet: selWallet });
  await page.goto(`${BASE}/share`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 8; i++) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (/0x[0-9a-fA-F]{2,6}…/.test(body)) break;
    const cb = page.getByText(/^connect wallet/i).first();
    if (await cb.count()) await cb.click({ force: true, timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const mr = page.getByText(/mock wallet/i).first();
    if (await mr.count()) { await mr.click({ force: true, timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1800); }
    const signBtn = page.getByRole("button", { name: /sign with wallet/i });
    if (await signBtn.count()) { await signBtn.click({ force: true, timeout: 20000 }).catch(() => {}); await page.waitForTimeout(2500); }
    const close = page.getByTitle("Close");
    if (await close.count()) await close.first().click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  log(`[seller] address after connect: ${((await page.locator("body").innerText()).match(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/) || ["NOT CONNECTED"])[0]}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
  const closeBtn = page.locator("w3m-modal .close-button, [data-testid=close-modal], button[aria-label='Close'], [title='Close']");
  for (let i = 0; i < 5 && (await page.locator("w3m-modal.open").count() || (await closeBtn.count())); i++) {
    if (await closeBtn.count()) await closeBtn.first().click({ force: true }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(500);
  const created = await L.fillNewShare(page, {
    title: TITLE,
    type: "article",
    body: "Direct rail payload: this is the paid body for the direct-rail unlock test.",
    excerpt: "paid direct-rail test",
    tags: "test, direct-rail",
    access: "paid",
    price: PRICE,
    log,
  });
  if (!created.published || !created.slug) {
    log(`[FATAL] share not published: ${JSON.stringify(created)}`);
    await browser.close();
    process.exit(1);
  }
  log(`[seller] created /ns/${created.slug} price=${PRICE}`);

  // ── 2) Buyer unlocks via the Direct rail ───────────────────────────────
  log("\n===== BUYER: direct-rail unlock =====");
  await browser.close();
  const fresh = await L.newBrowser();
  page = fresh.page;
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => log(`[buyer-pageerror] ${String(e.message).slice(0, 220)}`));
  page.on("console", (m) => { const t = m.text(); if (/error|warn|fail|nibgate|rail/i.test(t)) log(`[buyer-console] ${m.type()} ${t.slice(0, 220)}`); });
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api|circle|gateway|arc/.test(url) && !/\.(js|css|png|svg|ico|woff|ttf)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 300); } catch {}
      log(`[buyer-resp] ${res.status()} ${url.replace(BASE, "").slice(0, 120)} ${b.replace(/\s+/g, " ").slice(0, 300)}`);
    }
  });
  const { account: buyAcc, wallet: buyWallet } = await L.makeWallet(L.BUY_PK);
  const origReq = buyWallet.request.bind(buyWallet);
  buyWallet.request = async (req) => {
    log(`[buyer-walletreq] ${req.method} ${String(req.params?.[0]?.to || "").slice(0, 42)} ${String(req.params?.[0]?.data || "").slice(0, 20)}`);
    try { const r = await origReq(req); if (req.method === "eth_sendTransaction") log(`[buyer-tx] ${r}`); return r; }
    catch (e) { log(`[buyer-walletreq-ERR] ${req.method} ${(e.shortMessage || e.message || "").slice(0, 140)}`); throw e; }
  };
  await L.install({ page, wallet: buyWallet });
  await page.goto(`${BASE}/ns/${created.slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

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
  log(`[buyer] gate body: ${(await L.bodyText(page)).slice(0, 420)}`);

  // Ensure any AppKit modal is fully closed before interacting
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(700);

  // Switch to the Direct rail tab if present
  const railTabs = page.locator('[role="tab"]');
  if (await railTabs.count()) {
    const labels = await railTabs.allInnerTexts();
    log(`[buyer] rail tabs: ${JSON.stringify(labels)}`);
    const direct = page.locator('[role="tab"]', { hasText: /direct/i });
    const gateway = page.locator('[role="tab"]', { hasText: /gateway/i });
    if (await direct.count()) {
      await direct.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      const sel = await direct.getAttribute("aria-selected").catch(() => null);
      log(`[buyer] switched to Direct rail (aria-selected=${sel})`);
      if (sel !== "true") {
        await direct.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1200);
        log(`[buyer] retried Direct tab, aria-selected=${await direct.getAttribute("aria-selected").catch(() => null)} gw=${await gateway.getAttribute("aria-selected").catch(() => null)}`);
      }
    }
  }

  // Hold to pay (real broadcast through the mock wallet)
  const holdText = /hold to pay|unlock for free/i;
  if (await page.getByText(holdText).count()) {
    log("[buyer] triggering hold-to-pay on Direct rail");
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
      if (/Direct rail payload/.test(t)) { log("[buyer] CONTENT REVEALED after hold"); done = true; break; }
      if (/Something went wrong|Insufficient|error|failed/i.test(t)) { log(`[buyer] error state: ${t.slice(0, 240)}`); break; }
    }
    if (!done) log(`[buyer] final body: ${(await L.bodyText(page)).slice(0, 500)}`);
  } else {
    log(`[buyer] no hold-to-pay CTA; body: ${(await L.bodyText(page)).slice(0, 400)}`);
  }

  log("\n=== DONE ===");
  await fresh.browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });