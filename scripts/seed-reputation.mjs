import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viemEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/index.js');
const viemAccountsEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/accounts/index.js');
const { createPublicClient, createWalletClient, http, keccak256, stringToBytes } = await import(viemEntry);
const { privateKeyToAccount } = await import(viemAccountsEntry);

const RPC = process.env.NIBGATE_REPUTATION_RPC_URL || 'https://rpc.testnet.arc.io';
const PROXY = process.env.NIBGATE_REPUTATION_CONTRACT || '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
const OWNER_PK = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || '';

const NAMESPACE = 'nibgate:content:v1';
function cleanDomain(d = '') {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}
function contentHashFor(domain, externalId, url) {
  return keccak256(stringToBytes([NAMESPACE, cleanDomain(domain), externalId, url].join('|')));
}

const chain = { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const account = privateKeyToAccount(OWNER_PK);
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account, chain, transport: http(RPC) });

const ratingAbi = [{ type: 'function', name: 'ratingOf', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [{ type: 'tuple', components: [{ type: 'uint8' }, { type: 'bytes32' }, { type: 'string' }, { type: 'uint64' }] }] }];
const statsAbi = [{ type: 'function', name: 'contentStats', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] }];
const seedAbi = [{ type: 'function', name: 'seedRatings', stateMutability: 'nonpayable', inputs: [{ type: 'bytes32' }, { type: 'address[]' }], outputs: [] }];

const SIG = keccak256(stringToBytes('ContentRated(bytes32,address,uint8,bytes32,string)'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rc(a, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try { return await publicClient.readContract(a); } catch { await sleep(2000 * (i + 1)); }
  }
  throw new Error('RPC limit');
}
async function receipt(tx, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try { return await publicClient.getTransactionReceipt({ hash: tx }); } catch { await sleep(2000 * (i + 1)); }
  }
  throw new Error('RPC limit');
}

// Load ratings dump (from prod DB)
const rows = JSON.parse(fs.readFileSync(process.env.RATINGS_DUMP || '/tmp/nib-ratings.json', 'utf8'));
console.log('DB rating rows:', rows.length);

// DERIVE raters from on-chain event logs (ground truth), keyed by proof tx hash.
const txCache = new Map();
const byHash = new Map();
let eventsFound = 0, txs = 0;
for (const r of rows) {
  const proof = String(r.proof || '');
  if (!proof.startsWith('onchain:0x')) continue;
  const tx = proof.slice('onchain:'.length);
  let ev = txCache.get(tx);
  if (ev === undefined) {
    const rec = await receipt(tx);
    ev = (rec.logs || []).find(l => l.topics[0] === SIG);
    txCache.set(tx, ev ?? null);
    txs++;
    if (ev) eventsFound++;
    await sleep(800);
  }
  if (!ev) continue;
  const contentId = ev.topics[1];
  const rater = '0x' + ev.topics[2].slice(26);
  const canonical = contentHashFor(r.domain, r.externalId, r.url);
  const key = contentId;
  if (!byHash.has(key)) byHash.set(key, { raters: new Map(), title: r.url, mismatch: contentId !== canonical });
  byHash.get(key).raters.set(rater, true);
}
console.log('unique tx hashes fetched:', txs, 'with ContentRated event:', eventsFound);
console.log('content hashes with events:', byHash.size);

// Verify each rater's STORED record on-chain before seeding (tuple ABI).
const toSeed = [];
for (const [hash, info] of byHash) {
  const verified = [];
  for (const w of info.raters.keys()) {
    const stored = await rc({ address: PROXY, abi: ratingAbi, functionName: 'ratingOf', args: [hash, w] });
    if (Number(stored[0]) > 0) verified.push(w);
  }
  if (verified.length) toSeed.push({ hash, raters: verified, title: info.title });
  console.log(`${hash.slice(0, 10)}… cand=${info.raters.size} verified=${verified.length}${info.mismatch ? ' [contentId MISMATCH, using canonical]' : ''} (${info.title.slice(0, 48)})`);
}

console.log(`\nContents with verified on-chain ratings to seed: ${toSeed.length}`);

// Run seedRatings per content (owner only)
let ok = 0, fail = 0;
for (const { hash, raters, title } of toSeed) {
  try {
    const tx = await walletClient.writeContract({ address: PROXY, abi: seedAbi, functionName: 'seedRatings', args: [hash, raters], gas: 300000n });
    const receipt0 = await publicClient.waitForTransactionReceipt({ hash: tx });
    const stats = await rc({ address: PROXY, abi: statsAbi, functionName: 'contentStats', args: [hash] });
    console.log(`✓ ${hash.slice(0, 10)}… seeded ${raters.length} raters → contentStats(${stats[0]}, ${stats[1]}) tx=${tx.slice(0, 12)}`);
    ok++;
  } catch (e) {
    console.log(`✗ ${hash.slice(0, 10)}… FAILED: ${e.message.slice(0, 90)}`);
    fail++;
  }
}
console.log(`\nSeeded ${ok}, failed ${fail}`);
process.exit(0);
