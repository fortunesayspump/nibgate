const L = require("./prod-lib.js");
const fs = require("fs");
(async () => {
  const { browser, page } = await L.newBrowser();
  await L.install({ page, pk: L.BUY_PK });
  await page.goto("https://faucet.circle.com", { waitUntil: "networkidle", timeout: 45000 }).catch((e) => console.log("nav", e.message.slice(0, 80)));
  await page.waitForTimeout(5000);
  const html = await page.content();
  fs.writeFileSync("../scratch/faucet.html", html);
  console.log("html len:", html.length);
  console.log(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").slice(0, 4000));
  const roots = await page.evaluate(() => [...document.querySelectorAll("*")].filter(el => el.shadowRoot).map(el => el.tagName + ".#" + (el.id || "")));
  console.log("SHADOW ROOTS:", roots.slice(0, 20));
  await browser.close();
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });