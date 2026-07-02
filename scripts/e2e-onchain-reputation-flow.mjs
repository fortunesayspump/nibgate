import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, stringToBytes } = await import(path.join(rootDir, 'backend/node_modules/viem/_esm/index.js'));
const { privateKeyToAccount } = await import(path.join(rootDir, 'backend/node_modules/viem/_esm/accounts/index.js'));

const apiBase = (process.env.E2E_API_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const origin = process.env.E2E_ORIGIN || 'http://localhost:4304';
const siteId = process.env.E2E_SITE_ID || 'express-prisma-local';
const token = process.env.E2E_SITE_TOKEN || 'local-express-token';
const contractAddress = process.env.NIBGATE_REPUTATION_CONTRACT || '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
const rpcUrl = process.env.NIBGATE_REPUTATION_RPC_URL || 'https://rpc.testnet.arc.network';
const privateKey = process.env.E2E_BUYER_PRIVATE_KEY || process.env.NIBGATE_DEPLOYER_PRIVATE_KEY || '0xda9767356cc75323a8417e4bd8c133e9c5df3474ecff00b0112079c147adaa5e';
const buyer = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const now = Date.now();

const resource = {
  id: 'express-db-field-note',
  title: 'Agent economy DB note',
  summary: 'A DB-backed article with per-content Nibgate settings.',
  type: 'article',
  price: '0.005',
  currency: 'USDC',
  recipient: '0x2c5C6423993ba5102E5b0e1cE3079b9C26aa23bD',
  path: '/v1/nibgate/content/agent-economy-db-note',
  url: `${origin}/v1/nibgate/content/agent-economy-db-note`,
  tags: ['express', 'prisma', 'db-backed'],
  access: { humans: 'paid', agents: 'paid' },
  unlock: { mode: 'one_time' },
  paymentRail: 'gateway'
};

async function post(pathname, body, headers = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }
  if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function get(pathname) {
  const response = await fetch(`${apiBase}${pathname}`);
  const data = await response.json();
  if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function emit(event, payload = {}) {
  return post('/api/hub/track', {
    siteId,
    token,
    event,
    resource,
    url: resource.url,
    path: resource.path,
    visitorId: `e2e-onchain-${now}`,
    sessionId: `e2e-onchain-session-${now}`,
    ...payload
  });
}

const paymentId = `e2e-onchain-payment-${now}`;
await emit('content_registered');
await emit('resource_view', { actor: 'human' });
await emit('resource_view', { actor: 'agent', userAgent: 'NibgateAgent/0.1' });
await emit('payment_completed', {
  paymentProvider: 'e2e-gateway-record',
  paymentId,
  amount: Number(resource.price),
  revenue: Number(resource.price),
  currency: resource.currency,
  payer: buyer.address.toLowerCase(),
  recipient: resource.recipient,
  status: 'verified'
});
await emit('unlock_completed', {
  paymentProvider: 'e2e-gateway-record',
  paymentId,
  amount: Number(resource.price),
  revenue: Number(resource.price),
  currency: resource.currency,
  payer: buyer.address.toLowerCase(),
  recipient: resource.recipient,
  status: 'verified'
});

const prepare = await post('/api/hub/reputation/ratings/prepare', {
  siteId,
  token,
  resource,
  url: resource.url,
  path: resource.path
});

const abi = [{
  type: 'function',
  name: 'rateContent',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'contentId', type: 'bytes32' },
    { name: 'rating', type: 'uint8' },
    { name: 'reviewHash', type: 'bytes32' },
    { name: 'unlockRef', type: 'string' }
  ],
  outputs: []
}];
const chain = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
};
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: buyer, chain, transport: http(rpcUrl) });
const reviewHash = keccak256(stringToBytes(`onchain reputation e2e ${now}`));
const txHash = await walletClient.sendTransaction({
  to: contractAddress,
  data: encodeFunctionData({
    abi,
    functionName: 'rateContent',
    args: [prepare.contentHash, 49, reviewHash, paymentId]
  })
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== 'success') throw new Error(`Rating tx failed: ${txHash}`);

const indexed = await post('/api/hub/reputation/ratings/index', {
  siteId,
  token,
  txHash,
  resource,
  url: resource.url,
  path: resource.path
});

const explore = await get('/api/hub/explore/content?q=Agent%20economy');
const item = (explore.content || []).find((entry) => entry.externalId === resource.id || entry.websiteId === siteId);
const sites = await get('/api/hub/reputation/leaderboards?type=sites&limit=50');
const site = (sites.items || []).find((entry) => entry.id === siteId);
const creators = await get('/api/hub/reputation/leaderboards?type=creators&limit=50');
const creator = (creators.items || []).find((entry) => entry.walletAddress?.toLowerCase?.() === '0x558e7bfaf2cf1a494f44e50d92431afc060c9d12' || entry.name === 'Nibgate Studio');

console.log(JSON.stringify({
  ok: true,
  buyer: buyer.address,
  paymentId,
  contentHash: prepare.contentHash,
  ratingTx: txHash,
  indexedRating: indexed.rating,
  content: item && {
    id: item.id,
    externalId: item.externalId,
    receipts: item.receipts,
    ratings: item.ratings,
    reputationStars: item.reputationStars,
    reputationScore: item.reputationScore,
    views: item.views,
    unlocks: item.unlocks,
    revenue: item.revenue
  },
  site: site && {
    id: site.id,
    reputationScore: site.reputationScore,
    contentCount: site.contentCount,
    views: site.views,
    unlocks: site.unlocks,
    revenue: site.revenue
  },
  creator: creator && {
    name: creator.name,
    walletAddress: creator.walletAddress,
    reputationScore: creator.reputationScore,
    contentCount: creator.contentCount
  }
}, null, 2));
