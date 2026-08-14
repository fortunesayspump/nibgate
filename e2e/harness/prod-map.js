// Map the production create-post + settings + activity UI (connected as 0x7099).
const { installMockWallet } = require("@johanneskares/wallet-mock");
const { privateKeyToAccount } = require("viem/accounts");
const { arcTestnet } = require("viem/chains");
const { chromium } = require("playwright");

const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

(async () => {
  const browser = await chromium.launch({ headless: false, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await installMockWallet({ page, account: privateKeyToAccount(TEST_PK), defaultChain: arcTestnet });

  await page.goto("https://nibgate.xyz/share", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);
  console.log("=== FULL BODY (editor):");
  console.log((await page.locator("body").innerText()).split("\n").filter((l) => l.trim()).join(" | "));
  console.log("\n=== BUTTONS:", await page.getByRole("button").allInnerTexts());
  console.log("\n=== RADIOS:", (await page.locator("input[type=radio]").count()), "CHECKBOXES:", (await page.locator("input[type=checkbox]").count()));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });