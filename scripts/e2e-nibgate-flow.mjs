import crypto from 'node:crypto';
import { db } from '../packages/cli/src/core/db.js';

const { privateKeyToAccount } = await import('../node_modules/.pnpm/node_modules/viem/_esm/accounts/index.js');

const apiBase = (process.env.E2E_API_BASE || 'http://localhost:3000').replace(/\/+$/, '');
const ownerWallet = (process.env.E2E_OWNER_WALLET || '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12').toLowerCase();
const buyerPrivateKey = process.env.E2E_BUYER_PRIVATE_KEY || '';
if (!buyerPrivateKey) {
  throw new Error('Set E2E_BUYER_PRIVATE_KEY before running the e2e flow.');
}
const buyer = privateKeyToAccount(buyerPrivateKey);
const domain = process.env.E2E_SITE_DOMAIN || 'e2e.nibgate.local';
const origin = `https://${domain}`;
const now = Date.now();

const resource = {
  id: 'e2e-premium-article',
  title: 'E2E premium article',
  type: 'article',
  price: '0.005',
  currency: 'USDC',
  recipient: ownerWallet,
  path: '/premium',
  url: `${origin}/premium`,
  tags: ['e2e', 'article'],
  access: { humans: 'paid', agents: 'paid' },
  unlock: { mode: 'one_time' }
};

function ratingMessage(ratingValue) {
  return [
    'Nibgate content rating',
    `site:${domain}`,
    `content:${resource.id}`,
    `url:${resource.url}`,
    `rating:${ratingValue}`,
    'I confirm this rating is tied to my unlock/payment proof.'
  ].join('\n');
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...headers
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }
  if (!response.ok) {
    throw new Error(`${path} failed ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function get(path) {
  const response = await fetch(`${apiBase}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function ensureSite() {
  const user = await db.user.upsert({
    where: { walletAddress: ownerWallet },
    update: {},
    create: { walletAddress: ownerWallet, username: 'E2E Creator' }
  });

  await db.wallet.upsert({
    where: { address: ownerWallet },
    update: { userId: user.id, isPrimary: true },
    create: { userId: user.id, address: ownerWallet, isPrimary: true }
  });

  const existing = await db.website.findUnique({ where: { domain } });
  if (existing) {
    return db.website.update({
      where: { id: existing.id },
      data: {
        ownerId: user.id,
        isVerified: true,
        verificationStatus: 'verified',
        deletedAt: null,
        lastVerifiedAt: new Date()
      }
    });
  }

  return db.website.create({
    data: {
      domain,
      name: 'E2E Creator Site',
      description: 'Local e2e site for Nibgate package flow.',
      ownerId: user.id,
      verifyToken: `e2e_verify_${crypto.randomBytes(8).toString('hex')}`,
      siteToken: `e2e_site_${crypto.randomBytes(12).toString('hex')}`,
      isVerified: true,
      verificationStatus: 'verified',
      lastVerifiedAt: new Date()
    }
  });
}

async function emit(site, event, payload = {}) {
  return post('/hub/track', {
    siteId: site.id,
    token: site.verifyToken,
    event,
    resource,
    url: resource.url,
    path: resource.path,
    visitorId: 'e2e-visitor',
    sessionId: `e2e-session-${now}`,
    ...payload
  });
}

const site = await ensureSite();
await emit(site, 'content_registered');
await emit(site, 'resource_view');
await emit(site, 'payment_completed', {
  paymentProvider: 'e2e-signed-test',
  paymentId: `e2e-payment-${now}`,
  amount: Number(resource.price),
  revenue: Number(resource.price),
  currency: resource.currency,
  payer: buyer.address.toLowerCase(),
  recipient: resource.recipient,
  txHash: `0x${crypto.randomBytes(32).toString('hex')}`
});
await emit(site, 'unlock_completed', {
  paymentProvider: 'e2e-signed-test',
  paymentId: `e2e-payment-${now}`,
  amount: Number(resource.price),
  revenue: Number(resource.price),
  currency: resource.currency,
  payer: buyer.address.toLowerCase(),
  recipient: resource.recipient
});

const message = ratingMessage(45);
const signature = await buyer.signMessage({ message });
await emit(site, 'content_rating', {
  walletAddress: buyer.address.toLowerCase(),
  rating: 4.5,
  ratingMessage: message,
  ratingSignature: signature,
  paymentId: `e2e-payment-${now}`,
  proofType: 'signed'
});

const explore = await get('/hub/explore/content?q=E2E');
const item = (explore.content || []).find((entry) => entry.externalId === resource.id);
if (!item) throw new Error('E2E content was not discovered in explore API.');
if (!item.receipts) throw new Error('E2E unlock receipt was not recorded.');
if (!item.ratings) throw new Error('E2E signed rating was not recorded.');
if (Number(item.reputationStars || 0) < 4.5) throw new Error(`Expected signed rating stars, got ${item.reputationStars}`);

console.log(JSON.stringify({
  ok: true,
  apiBase,
  siteId: site.id,
  buyer: buyer.address,
  contentId: item.id,
  externalId: item.externalId,
  receipts: item.receipts,
  ratings: item.ratings,
  reputationStars: item.reputationStars,
  recipientWallet: item.recipientWallet
}, null, 2));
