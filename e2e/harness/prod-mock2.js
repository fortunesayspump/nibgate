// Phase 2: after connecting mock wallet, wait and dump state; try SIWE flows.
const { installMockWallet } = require("@johanneskares/wallet-mock");
const { privateKeyToAccount } = require("viem/accounts");
const { arcTestnet } = require("viem/chains");
const { chromium } = require("playwright");

const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const BASE = process.env.PROD_BASE || "https://nibgate.xyz/share/mine";
const URLS = process.env.PROD_URLS || "https://nibgate.xyz/share/mine,https://nibgate.xyz/share";

(async () => {
  const browser = await chromium.launch({ headless: false, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  await installMockWallet({ page, account: privateKeyToAccount(TEST_PK), defaultChain: arcTestnet });

  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|assert|unlock|siwe|auth|401|403|500/i.test(t) && t.length < 300)
      console.log("[console]", m.type(), t.slice(0, 260));
  });

  for (const u of URLS.split(",")) {
    console.log("\n===== URL:", u);
    await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) => console.log("[goto]", e.message.slice(0, 100)));
    await page.waitForTimeout(2000);
    const connect = page.getByText(/connect wallet/i).first();
    if (await connect.count()) {
      await connect.click().catch(() => {});
      await page.waitForTimeout(1800);
      const mock = page.getByText("Mock Wallet", { exact: false }).first();
      // anchor to a clickable element: the EIP-6963 row in AppKit has menuitem role
      const menuitem = page.getByRole("menuitem", { name: /mock wallet/i }).first();
      const target = (await menuitem.count()) ? menuitem : mock;
      console.log("[connect flow] menuitem?", await menuitem.count(), "text?", await mock.count());
      await target.click().catch((e) => console.log("[click mock]", e.message.slice(0, 120)));
      await page.waitForTimeout(4000);
      console.log("--- body after connect attempt:");
      console.log((await page.locator("body").innerText()).split("\n").filter((l) => l.trim()).slice(0, 40).join("\n"));
    } else {
      console.log("--- no connect button; body:");
      console.log((await page.locator("body").innerText()).split("\n").filter((l) => l.trim()).slice(0, 30).join("\n"));
    }
    await page.waitForTimeout(1000);
  }
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });