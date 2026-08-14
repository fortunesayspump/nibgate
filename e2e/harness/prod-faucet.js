// Drive faucet.circle.com with the buyer mock wallet to claim Arc testnet USDC.
const L = require("./prod-lib.js");
const fs = require("fs");
const log = (m) => { console.log(m); fs.appendFileSync("../logs/faucet.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const orig = wallet.request.bind(wallet);
  wallet.request = async (req) => {
    const method = String(req.method || "").toLowerCase();
    log(`[walletreq] ${req.method}`);
    if (method === "eth_signtypeddata_v4") {
      const data = JSON.parse(req.params[1]);
      log(`  typed domain=${JSON.stringify(data.domain)}`);
      const sig = await account.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message });
      log(`  -> signed`);
      return sig;
    }
    return orig(req);
  };
  await L.install({ page, wallet });
  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|captcha|claim|verify/i.test(t) && t.length < 220) log(`[console] ${m.type()} ${t.slice(0, 200)}`);
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (res.request().resourceType() === "fetch" || res.request().resourceType() === "xhr") {
      let b = ""; try { b = (await res.text()).slice(0, 220); } catch {}
      log(`[resp] ${res.status()} ${url.slice(0, 130)} ${b.slice(0, 220)}`);
    }
  });

  await page.goto("https://faucet.circle.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  log("PAGE:", (await L.bodyText(page)).slice(0, 600));

  // Try to connect + claim
  const steps = [
    [/connect wallet/i, "connect"],
    [/arc testnet|arc/i, "arc-select"],
    [/claim|get usdc|req[ue ]st/i, "claim"],
  ];
  for (const [re, name] of steps) {
    const el = page.getByText(re).first();
    if (await el.count()) {
      log(`[click] ${name}`);
      await el.click().catch((e) => log(`  click err ${e.message.slice(0, 80)}`));
      await page.waitForTimeout(2500);
      log("  BODY:", (await L.bodyText(page)).slice(0, 400));
    } else log(`[no element] ${name}`);
  }
  log("=== FINAL URL:", page.url());

  // dump all inputs/selects/buttons
  log("INPUTS:", await page.locator("input,select").evaluateAll((els) => els.map((e) => (e.tagName + "|" + (e.placeholder || e.name || e.value || "")))));

  if ((await page.getByText(/choose wallet|select a wallet/i).count()) || await page.getByRole("button", { name: /connect/i }).count()) {
    log("[connect modal present; trying Mock Wallet row]");
    const mockRow = page.getByText(/mock wallet/i).or(page.getByText(/mockwallet/i)).first();
    if (await mockRow.count()) { await mockRow.click(); await page.waitForTimeout(3000); log("BODY2:", (await L.bodyText(page)).slice(0, 400)); }
  }

  const bal = await L.nativeBalance(account.address);
  log("BUYER BALANCE:", bal);
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });