// Prod fast-e2e: mock EIP-6963 wallet (real EIP-3009/x402 signatures, TEST_PK funded
// 0x70997970c51812dc3a010c7d01b50e0d17dc79c8, 13.49 USDC) on Arc Testnet.
// Goal: prove connect+SIWE work headless, then enumerate dapp-to-extension UI.
const { installMockWallet } = require("@johanneskares/wallet-mock");
const { privateKeyToAccount } = require("viem/accounts");
const { arcTestnet } = require("viem/chains");
const { chromium } = require("playwright");

const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const BASE = process.env.PROD_BASE || "https://nibgate.xyz/share/mine";

(async () => {
  const browser = await chromium.launch({ headless: false, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await installMockWallet({
    page,
    account: privateKeyToAccount(TEST_PK),
    defaultChain: arcTestnet,
  });

  page.on("console", (m) => {
    const t = m.text();
    if (/error|warn|failed|sig|siwe|siwe|erc|3009|transfer|unlock/i.test(t) && t.length < 300)
      console.log("[console]", m.type(), t.slice(0, 280));
  });
  page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 120), r.failure()?.errorText));

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  console.log("=== PAGE TITLE:", await page.title());
  console.log("=== CONNECT BUTTONS:", await page.getByText(/connect wallet/i).count());

  const connect = page.getByText(/connect wallet/i).first();
  await connect.click().catch((e) => console.log("[click connect]", e.message.slice(0, 120)));
  await page.waitForTimeout(2000);

  const shot1 = "/tmp/opencode/e2e/mock-modal.png";
  await page.screenshot({ path: shot1 });
  console.log("=== screenshot:", shot1);
  console.log("=== MODAL TEXT (first 80):");
  const bodyT = await page.locator("w3m-modal, [class*=modal]").first().innerText().catch(() => "");
  console.log(bodyT ? bodyT.split("\n").slice(0, 24).join(" | ") : "(no modal)");

  const labels = ["Mock Wallet", "MetaMask", "WalletConnect", "Browser Wallet", "connect"];
  for (const l of labels) {
    const n = await page.getByText(l, { exact: false }).count();
    if (n) console.log("  found label:", l, n);
  }

  // try clicking any wallet entry
  const walletName = page.getByText("Mock Wallet", { exact: false }).first();
  if (await walletName.count()) {
    console.log("[clicking Mock Wallet]");
    await walletName.click().catch((e) => console.log("[click mock]", e.message.slice(0, 120)));
    await page.waitForTimeout(2500);
  } else {
    console.log("[Mock Wallet not auto-discovered]");
  }

  const shot2 = "/tmp/opencode/e2e/mock-after.png";
  await page.screenshot({ path: shot2 });
  console.log("=== screenshot after:", shot2);
  console.log("=== BODY (first 60 lines):");
  const txt = (await page.locator("body").innerText()).split("\n").filter((l) => l.trim()).slice(0, 60);
  console.log(txt.join("\n"));
  await browser.close();
})().catch((e) => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});