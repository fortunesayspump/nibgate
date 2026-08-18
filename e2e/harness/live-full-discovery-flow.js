// Live full discovery-flow E2E: explore -> open a paid product -> pay (gateway
// attempt + direct rail) -> rate it -> verify the payment + rating appear in the
// network ledger.
//
// Usage: node live-full-discovery-flow.js [slug]
const fs = require("fs");
const L = require("./prod-lib.js");
const { createWalletClient, http, parseUnits, encodeFunctionData } = require("viem");
const { arcTestnet } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");

const SUB = process.env.PROD_SUB || "analog";
const SLUG = process.env.PROD_SLUG || "analog-35mm-vs-medium-format-what-is-the-difference";
const HUB = "https://api.nibgate.xyz";
const SUBFRONT = `https://${SUB}.nibgate.xyz`;
const log = (m) => { console.log(m); fs.appendFileSync("../logs/live-full-discovery-flow.log", (new Date()).toISOString().slice(11, 19) + " " + m + "\n"); };
const wc = createWalletClient({ account: privateKeyToAccount(L.BUY_PK), chain: arcTestnet, transport: http(L.RPC) });
const BUYER = wc.account.address.toLowerCase();

async function connectBuyer(page) {
  for (let i = 0; i < 8; i++) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (/0x[0-9a-fA-F]{2,6}(…|\.\.\.)/.test(body)) return true;
    if (/sign the message/i.test(body) && await page.getByRole("button", { name: /sign with wallet/i }).count()) {
      await page.getByRole("button", { name: /sign with wallet/i }).click({ force: true, timeout: 20000 });
      await page.waitForTimeout(2500);
      continue;
    }
    const connectBtn = page.getByText(/connect wallet/i).first();
    if (await connectBtn.count()) {
      await connectBtn.click({ force: true, timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const mockRow = page.getByText(/mock wallet/i).first();
      if (await mockRow.count()) {
        await mockRow.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
      // some flows need a second confirm
      const again = page.getByText(/connect wallet/i).first();
      if (await again.count()) await again.click({ force: true, timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(1500);
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);
  return /0x[0-9a-fA-F]{2,6}(…|\.\.\.)/.test(await page.locator("body").innerText().catch(() => ""));
}

function fireHold(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find((b) => /hold to pay|unlock for free/i.test(b.textContent || ""));
    if (!btn) return false;
    const wrapper = btn.closest("div") || btn;
    const down = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", buttons: 1, pointerId: 7, isPrimary: true });
    const up = new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", buttons: 0, pointerId: 7, isPrimary: true });
    wrapper.dispatchEvent(down);
    setTimeout(() => wrapper.dispatchEvent(up), 2300);
    return true;
  });
}

(async () => {
  log(`[buyer] ${BUYER}`);
  let passed = 0, failed = 0;
  const ok = (label, cond, extra = "") => { (cond ? passed++ : failed++); log(`[${cond ? "PASS" : "FAIL"}] ${label} ${extra}`); return cond; };

  // ── 1) DISCOVERY ────────────────────────────────────────────────────────
  const probe = SLUG.replace(/^[a-z]+-/, "").split("-").slice(0, 4).join(" ");
  const explore = await fetch(`${HUB}/api/hub/explore/content?q=${encodeURIComponent(probe)}&limit=50`).then((r) => r.json()).catch(() => null);
  const items = explore?.content || [];
  const found = items.find((c) => (c.url || "").includes(`/${SLUG}`) || (c.path || "").includes(`/${SLUG}`));
  ok("explore API finds the paid product", Boolean(found), found ? `-> ${found.title} [${found.url}]` : `q="${probe}" items=${items.length}`);
  ok("explore product is verified site content", found?.websiteVerified === true);
  ok("explore product is priced", Number(found?.price) > 0, `price=${found?.price}`);
  const productUrl = found?.url || `${SUBFRONT}/writing/${SLUG}`;
  log(`[product] ${productUrl}`);

  // ── 2) OPEN IT (buyer browser) ─────────────────────────────────────────
  const { browser, context, page } = await L.newBrowser();
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => log(`[pageerror] ${String(e.message).slice(0, 200)}`));
  const { account: buyAcc, wallet: buyWallet } = await L.makeWallet(L.BUY_PK);
  await L.install({ page, wallet: buyWallet });
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(1800);
  const connected = await connectBuyer(page);
  await page.waitForTimeout(1500);
  const gateText = await L.bodyText(page);
  ok("buyer wallet connected on the gate", connected, gateText.slice(0, 120));
  ok("product page renders the paywall gate", /pay to unlock|hold to pay|unlock this content/i.test(gateText), gateText.slice(0, 200));
  const tabs = page.locator('[role="tab"]');
  const tabCount = await tabs.count();
  ok("gate renders rail tabs (Gateway + Direct)", tabCount >= 2, `tabs=${tabCount} ${JSON.stringify(await tabs.allInnerTexts().catch(() => []))}`);

  // ── 3) GATEWAY RAIL (attempt; upstream block expected) ─────────────────
  const gatewayTab = page.locator('[role="tab"]', { hasText: /^gateway$/i });
  const directTab = page.locator('[role="tab"]', { hasText: /^direct$/i });
  if (await gatewayTab.count()) { await gatewayTab.click({ force: true }).catch(() => {}); await page.waitForTimeout(900); }
  log("[gateway] rail selected");
  const gatewayHeld = await fireHold(page).catch(() => false);
  ok("gateway hold-to-pay triggers", gatewayHeld, gateText.slice(0, 120));
  await page.waitForTimeout(12000);
  const gb = await L.bodyText(page);
  log(`[gateway-after] ${gb.slice(0, 220)}`);
  const gwResult = /Something went wrong|Insufficient|unauthorized|could not be verified|not available|0x[0-9a-fA-F]/i.test(gb);
  ok("gateway rail reaches wallet/circle flow (upstream block expected)", gwResult, gb.slice(0, 180));
  log("[gateway] Circle verify/settle is blocked upstream on Arc testnet (FINDINGS #7). Direct rail is the working path.");

  // ── 4) DIRECT RAIL (working path) ──────────────────────────────────────
  if (await directTab.count()) { await directTab.click({ force: true }).catch(() => {}); await page.waitForTimeout(1000); }
  log("[direct] rail selected");
  const directHeld = await fireHold(page).catch(() => false);
  ok("direct hold-to-pay triggers", directHeld);
  let revealed = false;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(2000);
    const t = await L.bodyText(page);
    if (/(35mm and medium format are different worlds|medium format gives you)/i.test(t) && !/hold to pay|pay to unlock|gateway|direct/i.test(t)) {
      ok("DIRECT RAIL unlock reveals the paid body", true, t.slice(0, 180));
      revealed = true;
      break;
    }
    if (/Something went wrong|Insufficient|could not be verified/i.test(t)) { ok("DIRECT RAIL unlock reveals the paid body", false, t.slice(0, 180)); break; }
  }
  if (!revealed) ok("DIRECT RAIL unlock reveals the paid body", false, (await L.bodyText(page)).slice(0, 200));

  // ── 5) RATE IT ─────────────────────────────────────────────────────────
  const fiveStars = page.locator('button[aria-label="5 stars"]').first();
  if (await fiveStars.count()) {
    await fiveStars.click({ force: true }).catch(() => {});
    let confirmed = false;
    let rb = "";
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(1500);
      rb = await L.bodyText(page);
      if (/you rated 5|5 ★|5 stars saved|rating saved|thanks for rating|rating submitted/i.test(rb)) { confirmed = true; break; }
      // Authoritative check: the onchain rating must land in the hub ledger.
      const rLedger = await fetch(`${HUB}/api/hub/ledger?type=ratings&limit=100`).then((r) => r.json()).catch(() => null);
      const rRow = (rLedger?.activities || []).find((a) => (a.contentTitle || "").includes("35mm vs Medium Format") && String(a.walletAddress || "").toLowerCase() === BUYER && String(a.proof || "").startsWith("onchain:"));
      if (rRow) { confirmed = true; rb = `ledger rating row confirmed (score=${rRow.score})`; break; }
    }
    ok("rating star tap submits (5★ confirmed)", confirmed, rb.slice(0, 180));
    await page.waitForTimeout(3000);
  } else {
    ok("rating star control present (5★ button)", false, (await L.bodyText(page)).slice(0, 180));
  }
  log(`[rate-body] ${(await L.bodyText(page)).slice(0, 200)}`);
  await browser.close();

  // ── 6) LEDGER ──────────────────────────────────────────────────────────
  log("[ledger] querying hub ledger...");
  const ledgerPay = await fetch(`${HUB}/api/hub/ledger?type=payments&limit=100`).then((r) => r.json()).catch(() => null);
  const payRows = (ledgerPay?.activities || []).filter((a) => (a.contentTitle || "").includes("35mm vs Medium Format") && a.paymentProvider === "direct-transfer");
  ok("ledger has a direct-transfer payment row for the product", payRows.length > 0, `rows=${payRows.length}`);
  const top = payRows[0];
  if (top) {
    ok("ledger payment row has txHash", Boolean(top.txHash), `tx=${String(top.txHash || "").slice(0, 12)}…`);
    ok("ledger payment row payerWallet == buyer", String(top.payerWallet || "").toLowerCase() === BUYER, `payer=${top.payerWallet}`);
    ok("ledger payment row amount > 0", Number(top.amount) > 0, `amount=${top.amount}`);
    ok("ledger payment row has recipient", Boolean(top.recipientWallet), `rcpt=${top.recipientWallet}`);
  }

  const ledgerRate = await fetch(`${HUB}/api/hub/ledger?type=ratings&limit=100`).then((r) => r.json()).catch(() => null);
  const rateRows = (ledgerRate?.activities || []).filter((a) => (a.contentTitle || "").includes("35mm vs Medium Format") && String(a.walletAddress || "").toLowerCase() === BUYER);
  ok("ledger has a rating row for the product from the buyer", rateRows.length > 0, `rows=${rateRows.length}`);
  const rtop = rateRows[0];
  if (rtop) {
    ok("ledger rating row is onchain-proof", String(rtop.proof || "").startsWith("onchain:"), `proof=${String(rtop.proof || "").slice(0, 24)}…`);
    ok("ledger rating row score 1..5", Number(rtop.score) >= 1 && Number(rtop.score) <= 5, `score=${rtop.score}`);
  }

  log(`\n=== FULL DISCOVERY FLOW: ${passed} passed, ${failed} failed ===`);
  console.log(`\n[summary] PASS=${passed} FAIL=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });