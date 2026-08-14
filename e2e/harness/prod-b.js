// Phase B: buyer (0x3C44) POV on the 4 production posts. Log the paid-unlock x402 request.
const fs = require("fs");
const L = require("./prod-lib.js");

const STATE = "../scratch/prod-state.json";
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const log = (m) => { console.log(m); fs.appendFileSync("../logs/prod-b.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };
const POSTS = state.posts;
const PAID = POSTS.find(p => p.access === "paid");

(async () => {
  const { browser, page } = await L.newBrowser();
  const { account, wallet } = await L.makeWallet(L.BUY_PK);
  const buyAddr = account.address;

  // Wrap wallet.request to log every method/params (reveals x402 token + mechanism)
  const orig = wallet.request.bind(wallet);
  wallet.request = async (req) => {
    const dom = req.params?.[0]?.signTypedData?.domain || {};
    const vals = req.params?.[0]?.signTypedData?.message || {};
    const brief = {
      method: req.method,
      p0: req.params?.[0] && typeof req.params?.[0] === "object" ? Object.keys(req.params[0]).join(",") : null,
    };
    log(`[buyer:walletreq] ${JSON.stringify(brief)}`);
    if (req.method.toLowerCase().includes("typed")) {
      log(`  domain: ${JSON.stringify(dom)}`);
      if (vals.token) log(`  token: ${vals.token}  from: ${vals.from}  to: ${vals.to}  value: ${vals.value}`);
      if (vals.Transfer) log(`  Transfer: ${JSON.stringify(vals.Transfer).slice(0, 200)}`);
    }
    const r = await orig(req);
    return r;
  };
  await L.install({ page, wallet });
  console.log("buyer addr:", buyAddr);

  page.on("console", (m) => {
    const t = m.text();
    if (/error|fail|unlock|payment|quote|401|403|500|insufficient/i.test(t) && t.length < 300) log(`[buyer:console] ${m.type()} ${t.slice(0, 280)}`);
  });
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (/api\.nibgate|ns\//.test(url)) log(`[buyer:reqfail] ${url.slice(0, 130)} ${r.failure()?.errorText}`);
  });
  const responses = [];
  page.on("response", (res) => {
    const url = res.url();
    if (/api\.nibgate\.xyz|gateway-api|circle/.test(url) && !/\.(js|css|png|svg|ico)/.test(url)) {
      responses.push({ url: url.slice(0, 140), status: res.status() });
    }
  });

  // Helper: goto a post as buyer
  const visit = async (post) => {
    log(`\n===== BUYER VISIT: ${post.title} /ns/${post.slug} (` + (post.access) + ")");
    await page.goto(`https://nibgate.xyz/ns/${post.slug}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const addrTxt = page.getByText(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/);
    const hasAddr = await addrTxt.count();
    if (!hasAddr) {
      const connectBtn = page.getByText(/connect wallet/i).first();
      if (await connectBtn.count()) {
        await connectBtn.click().catch(() => {});
        await page.waitForTimeout(1200);
        const mockRow = page.getByText(/mock wallet/i).first();
        if (await mockRow.count()) await mockRow.click().catch(() => {});
        await page.waitForTimeout(1800);
      }
      if (await page.getByText(/sign the message/i).count())
        await page.getByRole("button", { name: /sign with wallet/i }).click();
      await page.waitForTimeout(3000);
    }
    const body = await L.bodyText(page);
    log(`[buyer] addr=${body.match(/0x[0-9a-fA-F]{2,6}…[0-9a-fA-F]{2,5}/)?.[0]} | gate: ${await page.getByText(/pay to unlock|invite only|no access|banned|you're on the whitelist|unlock/i).count()} ans`);
    log(`[buyer] BODY: ${body.slice(0, 700)}`);
    return body;
  };

  // 1) Free post
  await visit(POSTS.find(p => p.access === "free"));
  log(`  free-post body shows content? ${(await page.locator("body").innerText()).includes("Free post")}`);
  log(`  free-post unlock button present? ${await page.getByText(/unlock for free/i).count()}`);

  // 2) Whitelist post (buyer is whitelisted -> free unlock)
  let wlBody = await visit(POSTS.find(p => p.access === "whitelist"));
  log(`  whitelist banner? ${/you're on the whitelist/i.test(wlBody)}`);
  if (await page.getByText(/unlock for free|unlock free/i).count()) {
    log("  clicking whitelist free unlock...");
    await page.getByText(/unlock for free|unlock free/i).first().click();
    await page.waitForTimeout(3500);
    log(`  after whitelist unlock: content visible? ${(await page.locator("body").innerText()).includes("whitelisted wallets (that's you, buyer")} | body: ${(await L.bodyText(page)).slice(0, 400)}`);
  }

  // 3) Invite-only post (buyer NOT whitelisted)
  let invBody = await visit(POSTS.find(p => p.access === "invite-only"));
  log(`  invite-only screen? ${/invite only/i.test(invBody)} | "Invite only" heading? ${(await page.locator("body").innerText()).includes("Invite only")}`);

  // 4) Paid post — observe unlock request / token requirements
  const paidBody = await visit(PAID);
  log(`  paid gate shows price? ${/pay to unlock this content/i.test(paidBody)} | pay button? ${await page.getByText(/pay.*unlock|unlock.*usdc/i).count()}`);
  // find & click the unlock / pay CTA
  const cta = page.getByRole("button").filter({ hasText: /unlock|pay/i }).first();
  if (await cta.count()) {
    log(`  CTA text: "${(await cta.innerText()).slice(0, 60)}"`);
    await cta.click().catch((e) => log("  cta click err", e.message.slice(0, 100)));
    await page.waitForTimeout(4500);
    const after = await L.bodyText(page);
    log(`  AFTER pay attempt: ${after.slice(0, 500)}`);
    log("  API responses during flow:");
    for (const r of responses) log(`    ${r.status} ${r.url}`);
  } else {
    log("  [paid] NO unlock CTA found. body:", paidBody.slice(0, 400));
  }

  await browser.close();
  log("\nDONE phase B");
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });