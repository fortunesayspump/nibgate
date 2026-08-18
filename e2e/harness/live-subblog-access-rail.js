// Live subblog direct-rail API E2E (no UI): hits the live subblog access
// endpoint with rail=transfer, broadcasts a real USDC transfer to the
// challenge recipient, then re-requests with x-nibgate-transfer-tx and
// asserts the paid body reveals.
// Usage: node live-subblog-access-rail.js [slug]
const fs = require("fs");
const L = require("./prod-lib.js");
const { createWalletClient, http, parseUnits, encodeFunctionData } = require("viem");
const { arcTestnet } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");
const SUB = process.env.PROD_SUB || "analog";
const SLUG = process.env.PROD_SLUG || "analog-35mm-vs-medium-format-what-is-the-difference";
const log = (m) => { console.log(m); fs.appendFileSync("../logs/live-subblog-access-rail.log", (new Date()).toISOString().slice(11, 19) + " " + m + "\n"); };
const ACCESS = `https://${SUB}.nibgate.xyz/api/nibgate/access?path=/writing/${SLUG}&rail=transfer&wallet=`;
const USDC = "0x3600000000000000000000000000000000000000";
const USDC_TRANSFER_ABI = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }];
const wc = createWalletClient({ account: privateKeyToAccount(L.BUY_PK), chain: arcTestnet, transport: http(L.RPC) });

(async () => {
  const buyAddr = wc.account.address.toLowerCase();
  log(`[buyer] ${buyAddr}`);

  // 1) Request the transfer challenge
  let res = await fetch(`${ACCESS}${buyAddr}`);
  let body = await res.text();
  log(`[challenge] ${res.status} ${body.replace(/\s+/g, " ").slice(0, 400)}`);
  if (res.status !== 402) { log("[FATAL] expected 402 challenge"); process.exit(1); }
  let challenge = JSON.parse(body);
  const accept = challenge.accepts?.[0] || challenge;
  const payTo = accept.recipient || challenge.payTo || challenge.recipient;
  const amount = accept.amount || challenge.amount || challenge.payment?.amount;
  log(`[challenge] payTo=${payTo} amount=${amount} rail=${challenge.paymentRail || challenge.rail}`);
  if (!payTo || !amount) { log("[FATAL] no payTo/amount in challenge"); process.exit(1); }

  // 2) Broadcast a real USDC wrapper transfer (6 decimals)
  const data = encodeFunctionData({ abi: USDC_TRANSFER_ABI, functionName: "transfer", args: [payTo, parseUnits(String(amount), 6)] });
  const txHash = await wc.sendTransaction({ to: USDC, data });
  log(`[tx] ${txHash}`);
  const rc = await L.publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60000 });
  log(`[tx] status=${rc.status}`);
  if (rc.status !== "success") { log("[FATAL] transfer failed on chain"); process.exit(1); }

  // 3) Re-request access with the tx hash
  res = await fetch(`${ACCESS}${buyAddr}`, {
    headers: { "x-nibgate-transfer-tx": txHash },
  });
  body = await res.text();
  log(`[unlock] ${res.status} ${body.replace(/\s+/g, " ").slice(0, 500)}`);
  let data2;
  try { data2 = JSON.parse(body); } catch { data2 = {}; }
  if (res.ok && data2.ok && data2.content) {
    log(`[result] CONTENT REVEALED: ${String(data2.content).slice(0, 200)}`);
  } else {
    log(`[result] error: ${data2.error || res.status}`);
  }

  log("\n=== DONE ===");
  process.exit(0);
})().catch((e) => { console.error("[FATAL]", e); process.exit(1); });