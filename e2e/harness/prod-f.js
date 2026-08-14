// Phase F: full buyer matrix on production with real EIP-712 typed-data signing.
const fs = require("fs");
const L = require("./prod-lib.js");
const STATE = "../scratch/prod-state.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-f.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const orig = wallet.request.bind(wallet);
  wallet.request = async (req) => {
    const method = String(req.method || "").toLowerCase();
    if (method === "eth_signtypeddata_v4") {
      log(`[walletreq] eth_signTypedData_v4 (real EIP-712 via viem)`);
      try {
        const data = JSON.parse(req.params[1]);
        log(`  domain=${JSON.stringify(data.domain).slice(0, 200)}`);
        const m = data.message || {};
        if (m.Transfer) log(`  Transfer=${JSON.stringify(m.Transfer).slice(0, 300)}`);
        if (m.token) log(`  token=${m.token} from=${m.from} to=${m.to} value=${m.value}`);
        const sig = await account.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message });
        log(`  -> signed ${sig.slice(0, 22)}...${sig.slice(-8)} (${sig.length} chars)`);
        return sig;
      } catch (e) {
        log(`  [ERR] ${e.message?.slice(0, 160)}`);
        throw e;
      }
    }
    log(`[walletreq] ${req.method}`);
    let r;
    try { r = await orig(req); }
    catch (e) { log(`  [ERR] ${e.shortMessage || e.message?.slice(0, 100)}`); throw e; }
    return r;
  };
  await L.install({ page, wallet });

  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 200)}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/nibshare|api\.nibgate|circle|gateway|arc\.network/.test(url) && !/\.(js|css|png|svg|ico|woff)/.test(url)) {
      let b = ""; try { b = (await res.text()).slice(0, 240); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 130)} ${b.slice(0, 240)}`);
    }
  });

  const connect = async () => {
    for (let i = 0; i < 5; i++) {
      if (await page.getByText(/0x[0-9a-fA-F]{2,6}…/).count()) return;
      if (await page.getByText(/sign the message/i).count()) { await page.getByRole("button", { name: /sign with wallet/i }).click(); }
      else {
        const cb = page.getByText(/connect wallet/i).first();
        if (await cb.count()) { await cb.click().catch(() => {}); await page.waitForTimeout(900); }
        const mr = page.getByText(/mock wallet/i).first();
        if (await mr.count()) { await mr.click().catch(() => {}); }
      }
      await page.waitForTimeout(1400);
    }
  };

  const visit = async (post, { pay = false } = {}) => {
    log(`\n===== BUYER: ${post.title} (${post.access}) /ns/${post.slug}`);
    await page.goto(`https://nibgate.xyz/ns/${post.slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1800);
    await connect();
    await page.waitForTimeout(1500);
    const body = await L.bodyText(page);
    log(`[gate] ${body.slice(0, 420)}`);
    if (pay) {
      const unlockText = /unlock for free|hold to pay/i;
      if (await page.getByText(unlockText).count()) {
        log(`[pay] triggering hold on paid/free CTA`);
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll("button")];
          const btn = btns.find(b => /hold to pay|unlock for free/i.test(b.textContent || ""));
          if (!btn) return;
          const wrapper = btn.closest("div");
          const down = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", buttons: 1, pointerId: 1, isPrimary: true });
          const up = new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", buttons: 0, pointerId: 1, isPrimary: true });
          wrapper.dispatchEvent(down);
          setTimeout(() => wrapper.dispatchEvent(up), 2200);
        });
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(2000);
          const t = await L.bodyText(page);
          if (/Something went wrong|Insufficient|Payment|error/i.test(t) && /Processing|Checking|hold to pay/i.test(t)) break;
          if (!/Hold to pay|Processing|Checking|Pay to unlock/.test(t)) break;
        }
        log(`[after-pay] ${(await L.bodyText(page)).slice(0, 500)}`);
      } else log("[pay] no CTA found");
    }
  };

  // 1) free post => content
  await visit(state.posts.find(p => p.access === "free"));
  log(`  => free content visible? ${(await page.locator("body").innerText()).includes("Free post")}`);

  // 2) whitelist-free post => unlock free
  await visit(state.posts.find(p => p.access === "whitelist-free"), { pay: true });

  // 3) whitelist-same-as-public post => shows 9 USDC
  await visit(state.posts.find(p => p.access === "whitelist"), { pay: false });

  // 4) invite-only post
  await visit(state.posts.find(p => p.access === "invite-only"));

  // 5) paid post => full x402: typed sign -> access API 402/facilitator
  await visit(state.posts.find(p => p.access === "paid"), { pay: true });

  log("\n=== FINAL STATE ===");
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });