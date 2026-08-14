// Fund the e2e buyer from the repo master wallet (CryptoAlice, swarm-wallets.json id 1).
const { createPublicClient, http, formatEther, parseEther, createWalletClient } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { arcTestnet } = require("viem/chains");
const swarm = require("/Users/fortune/Documents/Workflows/nibgate-repo/swarm/swarm-wallets.json");

(async () => {
  const master = swarm.find(w => w.id === 1);
  const PK = master.privateKey;
  const account = privateKeyToAccount(PK);
  const BUY = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const RPC = process.env.RPC || "https://api.nibgate.xyz/rpc";
  const pc = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
  const wc = createWalletClient({ chain: arcTestnet, account, transport: http(RPC) });
  const amount = Number(process.env.AMOUNT || 25);
  const before = formatEther(await pc.getBalance({ address: account.address }));
  const buyBefore = formatEther(await pc.getBalance({ address: BUY }));
  console.log(`master ${master.name} ${account.address} bal=${before} | buyer bal=${buyBefore}`);
  const h = await wc.sendTransaction({ to: BUY, value: parseEther(String(amount)) });
  console.log("tx:", h);
  const rc = await pc.waitForTransactionReceipt({ hash: h, timeout: 120000 });
  const after = await pc.getBalance({ address: BUY });
  console.log(`status=${rc.status} feeUsed=${rc.gasUsed * rc.effectiveGasPrice} buyer now=${formatEther(after)}`);
  if (BigInt(after) <= 0n) process.exit(1);
})().catch((e) => { console.error("ERR", e.shortMessage || e.message, e.details || ""); process.exit(1); });