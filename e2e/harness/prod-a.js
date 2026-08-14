// Phase A: fund buyer with real USDC, then create 4 posts as seller 0x7099 on production.
const fs = require("fs");
const L = require("./prod-lib.js");
const { chromium } = require("playwright");
const http = require("http");

const BASE = process.env.PROD_BASE || "https://nibgate.xyz/share";
const STATE = "../scratch/prod-state.json";
let state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { posts: [] };
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-a.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };

(async () => {
  const sel = await L.makeWallet(L.SEL_PK);
  const buy = await L.makeWallet(L.BUY_PK);
  const BUY_ADDR = buy.account.address;

  // 1) Balances (0x7099 is RPC-blacklisted for sending; recipient-only)
  log(`sel bal: ${await L.nativeBalance(sel.account.address)} | buy bal: ${await L.nativeBalance(BUY_ADDR)} | buy addr: ${BUY_ADDR}`);
  log("note: 0x7099 (public hardhat key) is blocklisted by all Arc RPCs for eth_sendTransaction -> cannot fund buyer from it");

  // 2) Seller context: connect + create posts
  const { browser, page } = await L.newBrowser();
  await L.install({ page, pk: L.SEL_PK });
  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|401|403|500/i.test(t) && t.length < 240) log(`[sel:console] ${m.type()} ${t.slice(0, 220)}`);
  });
  page.on("requestfailed", (r) => log(`[sel:reqfail] ${r.url().slice(0, 100)} ${r.failure()?.errorText}`));

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  await L.connectSellerFlow(page, { label: "seller", log });

  // Free post
  if (!state.posts.some(p => p.title === "E2E Free Alpha")) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r1 = await L.fillNewShare(page, {
      title: "E2E Free Alpha", type: "article",
      body: "**Free post** for the e2e sweep.\n\nEnjoy — no payment needed.",
      excerpt: "Free e2e post", tags: "e2e, free", access: "free", expiry: "24 hours", log,
    });
    state.posts.push({ title: "E2E Free Alpha", slug: r1.slug, access: "free", published: r1.published });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  }

  // Paid post
  if (!state.posts.some(p => p.title === "E2E Paid Playbook")) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r2 = await L.fillNewShare(page, {
      title: "E2E Paid Playbook", type: "article",
      body: "**Paid post.** Pay 5 USDC to unlock the secrets inside.",
      excerpt: "Paid e2e post", tags: "e2e, paid", access: "paid", price: 5, expiry: "24 hours", log,
    });
    state.posts.push({ title: "E2E Paid Playbook", slug: r2.slug, access: "paid", published: r2.published });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  }

  // Whitelist post (buyer gets free; public pays 9)
  if (!state.posts.some(p => p.title === "E2E Whitelist Drop")) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r3 = await L.fillNewShare(page, {
      title: "E2E Whitelist Drop", type: "article",
      body: "Free for whitelisted wallets (that's you, buyer).",
      excerpt: "whitelist e2e post", tags: "e2e, whitelist", access: "paid", price: 9,
      whitelist: [BUY_ADDR], expiry: "24 hours", log,
    });
    state.posts.push({ title: "E2E Whitelist Drop", slug: r3.slug, access: "whitelist", price: 9, published: r3.published });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  }

  // Invite-only post (whitelist = a 3rd address so buyer is NOT whitelisted)
  if (!state.posts.some(p => p.title === "E2E Invite Only")) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r4 = await L.fillNewShare(page, {
      title: "E2E Invite Only", type: "article",
      body: "Only invited wallets can unlock this.",
      excerpt: "invite-only e2e post", tags: "e2e, invite", access: "paid", price: 12,
      whitelist: ["0x90F79bf6EB2c4f870365E785982E1f101E93b906"], inviteOnly: true, expiry: "24 hours", log,
    });
    state.posts.push({ title: "E2E Invite Only", slug: r4.slug, access: "invite-only", published: r4.published });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  }

  log("=== SELLER POSTS CREATED:");
  for (const p of state.posts) log(`  - ${p.title}: https://nibgate.xyz/ns/${p.slug}  access=${p.access} published=${p.published}`);

  // 3) Verify mine list
  await page.goto("https://nibgate.xyz/share/mine", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  log("=== MINE (after create):");
  log(await L.bodyText(page));
  await L.connectSellerFlow(page, { label: "seller", log });
  await page.waitForTimeout(1500);
  log("=== MINE (connected):");
  log(await L.bodyText(page));

  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });