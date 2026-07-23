import { normalizeRating } from '../core/rating.js';
import { normalizeResource } from '../core/resource.js';
import { emit, payloadWithResource } from './events.js';

const RATE_CONTENT_SELECTOR = '0xc62fad09';
const ZERO_HASH = `0x${'0'.repeat(64)}`;

export const NIBGATE_CONTENT_HASH_NAMESPACE = 'nibgate:content:v1';
export const NIBGATE_REPUTATION_CHAIN_ID = 5042002;
export const NIBGATE_REPUTATION_CHAIN_NAME = 'Arc Testnet';
export const NIBGATE_REPUTATION_RPC_URL = 'https://rpc.testnet.arc.io';
export const NIBGATE_REPUTATION_CONTRACT = '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';

export const NIBGATE_REPUTATION_ABI = [
  {
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
  }
];

function stripHex(value = '') {
  return String(value || '').replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

function word(hex = '') {
  const clean = stripHex(hex);
  if (clean.length > 64) throw new Error('ABI word is too long.');
  return clean.padStart(64, '0');
}

function wordRight(hex = '') {
  const clean = stripHex(hex);
  if (clean.length > 64) throw new Error('ABI word is too long.');
  return clean.padEnd(64, '0');
}

function numberWord(value = 0) {
  return Number(value || 0).toString(16).padStart(64, '0');
}

function utf8Hex(value = '') {
  return Array.from(new TextEncoder().encode(String(value || '')))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function encodeString(value = '') {
  const hex = utf8Hex(value);
  const byteLength = hex.length / 2;
  const paddedLength = Math.ceil(byteLength / 32) * 64;
  return numberWord(byteLength) + hex.padEnd(paddedLength, '0');
}

function encodeRateContent({ contentId, ratingValue, reviewHash, unlockRef }) {
  return RATE_CONTENT_SELECTOR
    + wordRight(contentId)
    + numberWord(ratingValue)
    + wordRight(reviewHash || ZERO_HASH)
    + numberWord(128)
    + encodeString(unlockRef || '');
}

export function contentRatingHash(_resource, options = {}) {
  const contentId = options.contentId || options.contentHash;
  if (!contentId) {
    throw new Error('contentId/contentHash is required. Use the Nibgate backend prepare endpoint or pass a known content hash.');
  }
  return contentId;
}

export function reviewTextHash(review = '') {
  if (!review) return ZERO_HASH;
  throw new Error('Text review hashing is not available in direct-browser mode. Pass reviewHash from your app/backend.');
}

async function prepareOnchainRating(resource, options = {}) {
  if (options.contentId || options.contentHash) return { contentId: options.contentId || options.contentHash };
  const prepareUrl = options.prepareUrl || options.indexUrl?.replace(/\/index$/, '/prepare');
  if (!prepareUrl) throw new Error('contentId/contentHash or prepareUrl is required for onchain rating.');
  const response = await fetch(prepareUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(options.indexHeaders || {}) },
    body: JSON.stringify({
      siteId: options.siteId,
      token: options.token,
      resource,
      url: resource.url,
      path: resource.path
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.contentHash) throw new Error(payload.error || 'Could not prepare Nibgate onchain rating.');
  return payload;
}

export async function rateContentOnchain(resource, options = {}) {
  const normalized = normalizeResource(resource);
  const rating = normalizeRating(options.rating ?? options.stars ?? options);
  if (!rating.ratingValue) throw new Error('Rating must be between 0.1 and 5 stars.');

  const provider = options.provider || globalThis?.ethereum;
  if (!provider?.request) throw new Error('Connect an EVM wallet to rate this content onchain.');

  const contractAddress = options.contractAddress || options.reputationContract || NIBGATE_REPUTATION_CONTRACT;
  if (!contractAddress) throw new Error('Nibgate reputation contract address is not configured.');

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const walletAddress = Array.isArray(accounts) ? accounts[0] || '' : '';
  if (!walletAddress) throw new Error('No wallet account selected.');

  const prepared = await prepareOnchainRating(normalized, options);
  const contentId = prepared.contentHash || prepared.contentId || contentRatingHash(normalized, options);
  const reviewHash = options.reviewHash || ZERO_HASH;
  const unlockRef = String(options.unlockRef || options.paymentId || options.txHash || '');
  const data = encodeRateContent({ contentId, ratingValue: rating.ratingValue, reviewHash, unlockRef });

  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: walletAddress,
      to: contractAddress,
      data
    }]
  });

  const payload = payloadWithResource(normalized, {
    rating: rating.rating,
    ratingValue: rating.ratingValue,
    walletAddress,
    txHash,
    contentHash: contentId,
    reviewHash,
    proofType: 'onchain_pending',
    proof: unlockRef,
    paymentId: options.paymentId,
    actor: options.actor || 'human'
  });
  emit('content_rating', payload);

  if (options.indexUrl) {
    await fetch(options.indexUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(options.indexHeaders || {}) },
      body: JSON.stringify({
        siteId: options.siteId,
        token: options.token,
        txHash,
        resource: normalized,
        url: normalized.url,
        path: normalized.path,
        actor: options.actor || 'human'
      })
    }).catch(() => null);
  }

  return { txHash, walletAddress, contentId, ratingValue: rating.ratingValue, reviewHash };
}
