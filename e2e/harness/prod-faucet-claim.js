const L = require("./prod-lib.js");
const fs = require("fs");
const log = (m) => { console.log(m); fs.appendFileSync("../logs/faucet.log", (new Date()).toISOString().slice(11,19) + " " + m + "\n"); };
const BUY = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

(async () => {
  const { browser, page } = await L.newBrowser();
  await L.install({ page, pk: L.BUY_PK });
  page.on("console", (m) => { const t = m.text(); if (/recaptcha|error|send|faucet|denied/i.test(t) && t.length < 200) log(`[console] ${m.type()} ${t.slice(0, 180)}`); });
  page.on("response", async (res) => {
    const url = res.url();
    if (res.request().resourceType() === "fetch" || res.request().resourceType() === "xhr") {
      let b = ""; try { b = (await res.text()).slice(0, 200); } catch {}
      if (/faucet|send|recaptcha/i.test(url)) log(`[resp] ${res.status()} ${url.slice(0, 120)} ${b.slice(0, 200)}`);
    }
  });

  await page.goto("https://faucet.circle.com", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(3000);
  // ensure Arc Testnet selected
  const arcSel = page.getByText("Arc Testnet", { exact: true }).first();
  log("arc option present:", await arcSel.count());
  if (await arcSel.count()) await arcSel.click().catch((e) => log("arc click err", e.message.slice(0, 80)));
  await page.waitForTimeout(800);

  const input = page.getByPlaceholder(/send to|wallet address|0x/i).first();
  log("input count:", await input.count(), "ph:", await input.getAttribute("placeholder").catch(()=>""));
  if (await input.count()) {
    await input.fill(BUY);
    await page.waitForTimeout(500);
    log("input value:", await input.inputValue());
  }
  await page.waitForTimeout(500);
  const send = page.getByRole("button", { name: /send 20 usdc|send USDC|send/i }).first();
  log("send btn count:", await send.count(), "text:", await send.innerText().catch(()=>""));
  if (await send.count()) await send.click().catch((e) => log("send click err", e.message.slice(0, 120)));
  await page.waitForTimeout(6000);
  const body = await page.locator("body").innerText().catch(()=> "");
  log("BODY:", body.slice(0, 500));
  const iframes = page.frames().map(f => f.url());
  log("FRAMES:", JSON.stringify(iframes).slice(0, 400));
  const cf = page.frames().find(f => /recaptcha|google/.test(f.url()));
  if (cf) log("GOT recaptcha frame");
  await page.waitForTimeout(5000);
  log("BAL AFTER:", await L.nativeBalance(BUY));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });