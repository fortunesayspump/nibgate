// Create the properly free-whitelist post (public 9, whitelist free) as seller 0x7099.
const fs = require("fs");
const L = require("./prod-lib.js");
const STATE = "../scratch/prod-state.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-g.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };
const BUY_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

(async () => {
  const { browser, page } = await L.newBrowser();
  await L.install({ page, pk: L.SEL_PK });
  await page.goto("https://nibgate.xyz/share", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  await L.connectSellerFlow(page, { label: "seller", log });

  const r = await L.fillNewShare(page, {
    title: "E2E Whitelist Free", type: "article",
    body: "Free for whitelisted wallets. Buyer sees Unlock for free.",
    excerpt: "whitelist-free e2e post", tags: "e2e, whitelist, free",
    access: "paid", price: 9, whitelist: [BUY_ADDR], wlTier: "free", expiry: "24 hours", log,
  });
  state.posts.push({ title: "E2E Whitelist Free", slug: r.slug, access: "whitelist-free", price: 9, published: r.published });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  log(`new post: https://nibgate.xyz/ns/${r.slug}`);
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });