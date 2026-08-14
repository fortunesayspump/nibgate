// Map create-post UI fully after SIWE (connected as 0x7099).
const { installMockWallet } = require("@johanneskares/wallet-mock");
const { privateKeyToAccount } = require("viem/accounts");
const { arcTestnet } = require("viem/chains");
const { chromium } = require("playwright");

const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

(async () => {
  const browser = await chromium.launch({ headless: false, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await installMockWallet({ page, account: privateKeyToAccount(TEST_PK), defaultChain: arcTestnet });

  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|401|403|500/i.test(t) && t.length < 240) console.log("[console]", m.type(), t.slice(0, 220));
  });
  page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 130), r.failure()?.errorText));

  await page.goto("https://nibgate.xyz/share", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  if (await page.getByText(/sign the message/i).count()) {
    await page.getByRole("button", { name: /sign with wallet/i }).click();
    await page.waitForTimeout(4000);
    console.log("=== AFTER SIWE:", (await page.locator("body").innerText()).split("\n").filter(l=>l.trim()).slice(0,12).join(" | "));
  }
  await page.waitForTimeout(2000);
  console.log("\n=== EDITOR BODY:", (await page.locator("body").innerText()).split("\n").filter((l) => l.trim()).join(" | "));
  console.log("\n=== BUTTONS:", await page.getByRole("button").allInnerTexts());
  console.log("\n=== INPUTS:", await page.locator("input").evaluateAll((els) => els.map((e) => ({ t: e.type, ph: e.placeholder, name: e.name }))));
  console.log("\n=== TEXTAREAS:", await page.locator("textarea").evaluateAll((els) => els.map((e) => ({ ph: e.placeholder }))));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });