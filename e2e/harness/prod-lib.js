// Shared helpers for the production e2e sweep (real mock wallets on Arc Testnet).
const { installMockWallet, createWallet } = require("@johanneskares/wallet-mock");
const { privateKeyToAccount } = require("viem/accounts");
const { http, createPublicClient, formatEther, parseEther } = require("viem");
const { arcTestnet } = require("viem/chains");
const { chromium } = require("playwright");

const SEL_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // 0x7099...79c8 funded
const BUY_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"; // 0x3C44...4293BC
const RPC = "https://rpc.testnet.arc.network";

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC) });

async function makeWallet(pk) {
  const account = privateKeyToAccount(pk);
  const wallet = createWallet(account, { [arcTestnet.id]: http(RPC) }, arcTestnet);
  wallet.__account = account;
  return { account, wallet };
}

async function install({ page, pk, wallet } = {}) {
  if (page.__nibE2EInstalled) return page.__nibE2EInstalled;
  const made = wallet ? ({ account: wallet.__account, wallet }) : await makeWallet(pk);
  await installMockWallet({ page, wallet: made.wallet });
  page.__nibE2EInstalled = made;
  return made;
}

async function fundBuyer({ from, to, amount, log }) {
  const txnHash = await from.wallet.request({
    method: "eth_sendTransaction",
    params: [{ from: from.account.address, to, value: parseEther(String(amount)) }],
  });
  log && log(`[tx] ${amount} USDC ${from.account.address.slice(0, 8)} -> ${to.slice(0, 8)}  ${txnHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txnHash, timeout: 90_000 }).catch((e) => {
    log && log("[txwait]", e.message.slice(0, 140));
  });
}

async function nativeBalance(addr) {
  try { return Number(formatEther(await publicClient.getBalance({ address: addr }))).toFixed(4); }
  catch { return "ERR"; }
}

async function newBrowser(headless = false) {
  const browser = await chromium.launch({ headless, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { browser, context, page };
}

async function install({ page, pk, wallet } = {}) {
  if (page.__nibE2EInstalled) return page.__nibE2EInstalled;
  const made = wallet ? { account: wallet.__account, wallet } : await makeWallet(pk);
  const account = made.wallet.__account;
  await installMockWallet({ page, wallet: made.wallet });
  page.__nibE2EInstalled = { account, wallet: made.wallet };
  return page.__nibE2EInstalled;
}

async function connectSellerFlow(page, { label, log }) {
  for (let i = 0; i < 6; i++) {
    const hasAddr = await page.getByText(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/).count();
    if (hasAddr) break;
    if (await page.getByTitle("Close").count()) {
      await page.getByTitle("Close").first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    const connectBtn = page.getByText(/connect wallet/i).first();
    if ((await page.getByText(/sign the message/i).count()) > 0 && await page.getByRole("button", { name: /sign with wallet/i }).count()) {
      await page.getByRole("button", { name: /sign with wallet/i }).click({ force: true, timeout: 20000 });
      await page.waitForTimeout(2500);
    } else if (await connectBtn.count()) {
      await connectBtn.click({ force: true, timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const mockRow = page.getByText(/mock wallet/i).first();
      if (await mockRow.count()) {
        await mockRow.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
    await page.waitForTimeout(1200);
  }
  const body = (await page.locator("body").innerText());
  const addrMatch = body.match(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/);
  log && log(`[${label}] address: ${addrMatch ? addrMatch[0] : "NOT CONNECTED"}  | siwe? ${body.includes("Sign the message")}`);
  if (await page.getByText(/sign the message/i).count()) {
    await page.getByRole("button", { name: /sign with wallet/i }).click({ force: true, timeout: 20000 });
    await page.waitForTimeout(3000);
    log && log(`[${label}] after siwe address: ${(await page.locator("body").innerText()).match(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/)?.[0]}`);
  }
  return (await page.locator("body").innerText()).match(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/)?.[0] || "";
}

async function fillNewShare(page, { title, type = "article", body, excerpt, tags, access, price, whitelist, whitelistPrice, wlTier, inviteOnly, expiry, log }) {
  await page.getByPlaceholder(/Post title|Photo title|Track title|Document title|Video title/).fill(title);
  if (type && type !== "article") {
    await page.locator("select.input-field").selectOption(type);
    await page.waitForTimeout(400);
  }
  if (body) {
    const editor = page.locator(".tiptap, .ProseMirror [contenteditable], [contenteditable]").first();
    await editor.click();
    await page.keyboard.type(body, { delay: 2 });
    await page.waitForTimeout(300);
  }
  if (excerpt) {
    const ex = page.getByPlaceholder("Short description");
    if (await ex.count()) await ex.fill(excerpt);
  }
  if (tags) await page.getByPlaceholder(/tools, craft, general/i).fill(tags);
  if (access === "paid") {
    const paidSel = page.getByText(/pay to unlock/i).first();
    await paidSel.click().catch(() => {});
    await page.waitForTimeout(400);
    const priceInput = page.getByLabel(/price in usdc/i);
    if (await priceInput.count()) await priceInput.fill(String(price));
    else await page.getByPlaceholder("e.g. 1").fill(String(price));
  }
  if (whitelist && whitelist.length) {
    const wlInput = page.getByPlaceholder(/0x… — paste one or many wallets/i);
    for (const w of whitelist) {
      await wlInput.fill(w);
      await page.getByRole("button", { name: /add/i }).click();
      await page.waitForTimeout(300);
    }
  }
  if (wlTier && whitelist && whitelist.length) {
    const tierSel = page.locator("select.input-field", { has: page.getByRole("option", { name: /same as public price/i }) }).first();
    if (await tierSel.count()) {
      if (wlTier === "public") await tierSel.selectOption("__public");
      else if (wlTier === "free") await tierSel.selectOption("__free");
      else {
        await tierSel.selectOption("__custom");
        await page.waitForTimeout(300);
        const cust = page.getByPlaceholder("e.g. 0.50");
        if (await cust.count()) await cust.fill(String(wlTier));
      }
      await page.waitForTimeout(300);
    }
  }
  if (whitelistPrice !== undefined && access === "paid") {
    await page.getByLabel(/whitelist price|whitelisted wallets pay/i).fill(String(whitelistPrice)).catch(() => {});
  }
  if (inviteOnly) {
    const cb = page.locator("input[type=checkbox]").first();
    await cb.check({ force: true }).catch(() => {
      const label = page.getByText(/invite only —/i).first();
      label.click().catch(() => {});
    });
    await page.waitForTimeout(300);
  }
  if (expiry) {
    await page.getByText(expiry, { exact: true }).first().click().catch(() => {});
  }
  await page.getByRole("button", { name: /publish/i }).click();
  await page.waitForTimeout(3500);
  const bodyText = await page.locator("body").innerText();
  const slug = bodyText.match(/\/ns\/([A-Za-z0-9_-]+)/)?.[1] || "";
  const pub = bodyText.includes("Published!");
  log && log(`[publish] title=${title} type=${type} access=${access}${inviteOnly ? " inviteOnly" : ""} published=${pub} slug=${slug}`);
  if (!pub) {
    log && log("  PUBLISH ERROR BODY:", bodyText.split("\n").filter(l => l.trim()).slice(0, 20).join(" | "));
  }
  if (await page.getByTitle("Close").count()) await page.getByTitle("Close").first().click().catch(() => {});
  await page.waitForTimeout(1000);
  return { slug, published: pub };
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).split("\n").filter((l) => l.trim()).join(" | ");
}

module.exports = { SEL_PK, BUY_PK, RPC, makeWallet, fundBuyer, nativeBalance, newBrowser, install, connectSellerFlow, fillNewShare, bodyText, publicClient };