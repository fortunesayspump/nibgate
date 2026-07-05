import { db } from '@nibgate/cli/src/core/db.js';
import { getUserBySession } from '@nibgate/cli/src/core/auth.js';
import crypto from 'node:crypto';
import { createPublicClient, decodeEventLog, http, keccak256, stringToBytes, verifyMessage } from 'viem';
import { deleteManagedProfileImage } from './upload-routes.js';

let verificationMonitorStarted = false;
let manifestSyncMonitorStarted = false;
let reputationIndexerStarted = false;
let reputationIndexerLastBlock = null;

const DEFAULT_NIBGATE_REPUTATION_CONTRACT = '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
const DEFAULT_NIBGATE_REPUTATION_RPC_URL = 'https://rpc.testnet.arc.network';

// Helper to authenticate user via cookie
async function requireAuth(req, res, next) {
  const sessionToken = req.cookies.auth_session;
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  req.user = user;
  next();
}

function cleanDomain(domain = '') {
  return String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function isValidDomain(domain = '') {
  return /^localhost(:\d+)?$|^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain);
}

function originFor(domain) {
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${domain}`;
}

function manifestCandidateUrls(website) {
  const origin = originFor(website.domain).replace(/\/+$/, '');
  return [
    `${origin}/nibgate.json`,
    `${origin}/.well-known/nibgate.json`,
    `${origin}/v1/nibgate/manifest`,
    `${origin}/v1/nibgate/nibgate.json`
  ];
}

function trackingScriptFor(website) {
  const widgetUrl = process.env.NIBGATE_WIDGET_URL || 'https://nibgate.xyz/widget.js';
  const apiUrl = process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL || 'https://api.nibgate.xyz';
  return `<script async src="${widgetUrl}" data-nibgate-site="${website.id}" data-nibgate-token="${website.verifyToken}" data-nibgate-api="${apiUrl.replace(/\/+$/, '')}"></script>`;
}

function serializeWebsite(website) {
  return {
    id: website.id,
    name: website.name,
    domain: website.domain,
    description: website.description || '',
    isVerified: website.isVerified,
    verificationStatus: website.verificationStatus || (website.isVerified ? 'verified' : 'pending'),
    lastVerifiedAt: website.lastVerifiedAt || null,
    lastVerificationCheckAt: website.lastVerificationCheckAt || null,
    verificationFailureReason: website.verificationFailureReason || '',
    verifyToken: website.verifyToken,
    faviconUrl: website.faviconUrl || '',
    ogImageUrl: website.ogImageUrl || '',
    trackingScript: trackingScriptFor(website),
    lastSyncAt: website.lastSyncAt || null,
    createdAt: website.createdAt,
    _count: {
      content: website._count?.content || 0,
      metrics: website._count?.metrics || 0
    }
  };
}

function serializePublisherIdentity(publisher) {
  return {
    id: publisher.id,
    websiteId: publisher.websiteId,
    websiteName: publisher.website?.name || '',
    websiteDomain: publisher.website?.domain || '',
    externalId: publisher.externalId,
    handle: publisher.handle || '',
    name: publisher.name || '',
    walletAddress: publisher.walletAddress || '',
    profileUrl: publisher.profileUrl || '',
    verification: publisher.verification || 'platform_attested',
    contentCount: publisher._count?.content || 0,
    metrics: publisher._count?.metrics || 0,
    unlockReceipts: publisher._count?.unlockReceipts || 0,
    ratings: publisher._count?.ratings || 0,
    createdAt: publisher.createdAt,
    updatedAt: publisher.updatedAt
  };
}

async function checkWebsiteVerification(website) {
  const checkedAt = new Date();
  const homeUrl = originFor(website.domain);
  const data = {
    lastVerificationCheckAt: checkedAt
  };

  try {
    const html = await fetchHomeHtml(website.domain);
    if (!htmlContainsTrackingScript(html, website)) {
      return {
        ok: false,
        status: 'missing_widget',
        reason: 'Nibgate widget was not found on the site homepage.',
        data: {
          ...data,
          isVerified: false,
          verificationStatus: 'missing_widget',
          verificationFailureReason: 'Nibgate widget was not found on the site homepage.'
        }
      };
    }

    let ogImageUrl = null;
    let description = website.description;
    try {
      const ogMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogMatch && ogMatch[1]) {
        ogImageUrl = ogMatch[1].startsWith('/') ? `${homeUrl}${ogMatch[1]}` : ogMatch[1];
      }

      if (!description) {
        const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
        if (descMatch && descMatch[1]) description = descMatch[1];
      }
    } catch (error) {
      console.log('Failed to scrape metadata:', error.message);
    }

    return {
      ok: true,
      status: 'verified',
      reason: '',
      data: {
        ...data,
        isVerified: true,
        verificationStatus: 'verified',
        lastVerifiedAt: checkedAt,
        verificationFailureReason: null,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${website.domain}&sz=128`,
        ogImageUrl,
        description
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      reason: 'Could not fetch the site homepage to verify the Nibgate widget.',
      data: {
        ...data,
        isVerified: false,
        verificationStatus: 'failed',
        verificationFailureReason: 'Could not fetch the site homepage to verify the Nibgate widget.'
      }
    };
  }
}

function hostnameMatchesSite(hostname = '', domain = '') {
  const cleanHost = cleanDomain(hostname);
  const cleanSite = cleanDomain(domain);
  return cleanHost === cleanSite || cleanHost === `www.${cleanSite}` || cleanHost.replace(/^www\./, '') === cleanSite;
}

function eventTypeFor(input = '') {
  const event = String(input || '').trim().toLowerCase();
  if (['resource_unlock', 'unlock', 'unlock_started', 'unlock_completed'].includes(event)) return 'unlock';
  if (['payment_completed', 'payment_success', 'payment_failed'].includes(event)) return 'payment';
  if (['content_rating', 'rating_submitted', 'rating_completed'].includes(event)) return 'rating';
  if (['time_spent', 'heartbeat'].includes(event)) return 'time';
  if (['content_registered'].includes(event)) return 'content';
  if (['engagement', 'cta_click', 'scroll_depth', 'download', 'play', 'copy'].includes(event)) return 'engagement';
  return 'view';
}

function cleanEventName(input = '') {
  return String(input || 'page_view').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_').slice(0, 80) || 'page_view';
}

function numberOrNull(value) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : null;
}

function intOrNull(value) {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) ? next : null;
}

function dateRangeWhere(req) {
  const createdAt = {};
  const from = new Date(String(req.query?.from || ''));
  const to = new Date(String(req.query?.to || ''));
  if (!Number.isNaN(from.getTime())) createdAt.gte = from;
  if (!Number.isNaN(to.getTime())) createdAt.lte = to;
  return Object.keys(createdAt).length ? { createdAt } : {};
}

const ALLOWED_CONTENT_TYPES = new Set(['music', 'video', 'article', 'image']);

function normalizeContentType(value = '') {
  const type = String(value || '').trim().toLowerCase();
  if (ALLOWED_CONTENT_TYPES.has(type)) return type;
  if (['audio', 'song', 'track', 'album', 'playlist'].includes(type)) return 'music';
  if (['photo', 'picture', 'illustration', 'art'].includes(type)) return 'image';
  if (['movie', 'clip'].includes(type)) return 'video';
  return 'article';
}

function absoluteResourceUrl(website, resource = {}, fallbackUrl = '') {
  const value = String(resource.url || resource.path || fallbackUrl || '').trim();
  if (!value) return `${originFor(website.domain)}/`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${originFor(website.domain)}${value.startsWith('/') ? value : `/${value}`}`;
}

function cleanTags(value) {
  const tags = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return tags
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 12);
}

function cleanPublisherHandle(value = '') {
  return String(value || '').trim().replace(/^@+/, '').slice(0, 120);
}

function normalizeWallet(value = '') {
  return String(value || '').trim().toLowerCase() || null;
}

function publisherPayloadFor(payload = {}) {
  const resource = payload.resource && typeof payload.resource === 'object' ? payload.resource : {};
  const publisher = resource.publisher && typeof resource.publisher === 'object' ? resource.publisher : {};
  const fallbackHandle = cleanPublisherHandle(resource.authorHandle || resource.creatorHandle || payload.publisherHandle || payload.authorHandle || '');
  const walletAddress = normalizeWallet(
    publisher.walletAddress ||
    publisher.wallet ||
    resource.publisherWallet ||
    resource.authorWallet ||
    resource.creatorWallet ||
    payload.publisherWallet ||
    payload.authorWallet ||
    payload.creatorWallet ||
    payload.walletAddress
  );
  const externalId = String(
    publisher.id ||
    publisher.externalId ||
    resource.publisherId ||
    resource.authorId ||
    resource.creatorId ||
    payload.publisherId ||
    payload.authorId ||
    payload.creatorId ||
    fallbackHandle ||
    walletAddress ||
    ''
  ).trim();

  if (!externalId) return null;

  return {
    externalId: externalId.slice(0, 220),
    handle: cleanPublisherHandle(publisher.handle || publisher.username || fallbackHandle),
    name: String(publisher.name || publisher.displayName || payload.publisherName || '').trim().slice(0, 220) || null,
    walletAddress,
    profileUrl: String(publisher.profileUrl || publisher.url || resource.publisherProfileUrl || payload.publisherProfileUrl || '').trim().slice(0, 500) || null,
    verification: String(publisher.verification || publisher.verificationStatus || payload.publisherVerification || 'platform_attested').trim().slice(0, 80),
    metadata: publisher && Object.keys(publisher).length ? JSON.stringify(publisher).slice(0, 4000) : null
  };
}

async function upsertPublisherIdentity(website, payload = {}) {
  const publisher = publisherPayloadFor(payload);
  if (!publisher) return null;

  return db.publisherIdentity.upsert({
    where: { websiteId_externalId: { websiteId: website.id, externalId: publisher.externalId } },
    update: publisher,
    create: {
      websiteId: website.id,
      ...publisher
    }
  });
}

function publisherContentFields(publisher) {
  if (!publisher) return {};
  return {
    publisherId: publisher.id,
    publisherExternalId: publisher.externalId,
    publisherHandle: publisher.handle || null,
    publisherWallet: publisher.walletAddress || null,
    publisherProfileUrl: publisher.profileUrl || null,
    publisherVerification: publisher.verification || 'platform_attested'
  };
}

function contentDataFor(website, payload = {}, publisher = null) {
  const resource = payload.resource || {};
  const url = absoluteResourceUrl(website, resource, payload.url);
  const externalId = String(resource.id || resource.contentId || resource.slug || '').trim() || null;
  const title = String(resource.title || payload.title || url).trim() || 'Untitled resource';
  const contentType = normalizeContentType(resource.type || resource.contentType);
  const tags = cleanTags(resource.tags || payload.tags);
  const pathValue = resource.path || resource.route || payload.path || null;
  const metadataQuality = payload.metadataQuality || resource.metadataQuality || {};
  const accessPolicy = resource.access ? { ...resource.access } : null;
  const unlockPolicy = resource.unlock ? { ...resource.unlock } : null;
  if (metadataQuality && typeof metadataQuality === 'object' && (metadataQuality.warnings || metadataQuality.errors || metadataQuality.score !== undefined)) {
    if (accessPolicy) accessPolicy.metadataQuality = metadataQuality;
  }
  const metadataOnlyPolicy = !accessPolicy && metadataQuality && typeof metadataQuality === 'object' && (metadataQuality.warnings || metadataQuality.errors || metadataQuality.score !== undefined)
    ? { metadataQuality }
    : null;
  return {
    externalId,
    title,
    description: resource.description || payload.description || null,
    imageUrl: resource.imageUrl || resource.image || payload.imageUrl || null,
    contentType,
    tags: tags.join(','),
    url,
    path: pathValue,
    currency: resource.currency || payload.currency || 'USDC',
    price: Number.parseFloat(resource.price || payload.price || resource.amount || payload.amount || '0') || 0,
    recipientWallet: resource.recipient || resource.payTo || resource.receiver || resource.receiverAddress || resource.creatorWallet || payload.recipient || payload.payTo || payload.receiver || null,
    accessPolicy: accessPolicy ? JSON.stringify(accessPolicy).slice(0, 2000) : (metadataOnlyPolicy ? JSON.stringify(metadataOnlyPolicy).slice(0, 2000) : null),
    unlockPolicy: unlockPolicy ? JSON.stringify(unlockPolicy).slice(0, 2000) : null,
    ...publisherContentFields(publisher),
    lastSeenAt: new Date()
  };
}

async function upsertTrackedContent(website, payload = {}) {
  const resource = payload.resource || {};
  const hasResourceSignal = resource.id || resource.url || resource.path || resource.title || payload.event === 'content_registered' || payload.event === 'resource_view' || payload.event === 'resource_unlock';
  if (!hasResourceSignal) return null;

  const publisher = await upsertPublisherIdentity(website, payload);
  const data = contentDataFor(website, payload, publisher);
  const idSeed = data.externalId || data.url;
  const contentId = crypto.createHash('md5').update(website.id + idSeed).digest('hex');

  return db.content.upsert({
    where: { id: contentId },
    update: data,
    create: {
      id: contentId,
      websiteId: website.id,
      ...data
    },
    include: { publisher: true }
  });
}

function resourcesFromManifest(manifest = {}) {
  if (Array.isArray(manifest.content)) return manifest.content;
  if (Array.isArray(manifest.resources)) return manifest.resources;
  if (Array.isArray(manifest.nibgate?.content)) return manifest.nibgate.content;
  if (Array.isArray(manifest.nibgate?.resources)) return manifest.nibgate.resources;
  return [];
}

function paymentPayload(payload = {}) {
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : {};
  return { ...payload, ...payment };
}

function walletFromPayload(payload = {}) {
  const input = paymentPayload(payload);
  return String(input.walletAddress || input.payer || input.buyer || input.account || input.address || '').trim().toLowerCase();
}

function paymentIdFromPayload(payload = {}, contentId = '') {
  const input = paymentPayload(payload);
  const direct = input.paymentId || input.id || input.txHash || input.transactionHash || input.transaction || input.receiptUrl;
  if (direct) return String(direct).slice(0, 220);
  return crypto.createHash('sha256').update(JSON.stringify({
    contentId,
    visitorId: payload.visitorId || '',
    sessionId: payload.sessionId || '',
    event: payload.event || '',
    occurredAt: payload.occurredAt || payload.createdAt || Date.now()
  })).digest('hex');
}

async function upsertUnlockReceipt(website, content, payload = {}, eventName = '') {
  if (!content || !['payment_completed', 'payment_success', 'unlock_completed', 'resource_unlock', 'unlock'].includes(eventName)) return null;
  const input = paymentPayload(payload);
  const paymentId = paymentIdFromPayload(payload, content.id);

  return db.unlockReceipt.upsert({
    where: { contentId_paymentId: { contentId: content.id, paymentId } },
    update: {
      publisherId: content.publisherId || null,
      payerWallet: walletFromPayload(payload) || null,
      actor: input.actor || payload.actor || null,
      paymentProvider: input.paymentProvider || input.provider || null,
      txHash: input.txHash || input.transactionHash || input.transaction || null,
      receiptUrl: input.receiptUrl || null,
      chainId: input.chainId ? String(input.chainId) : null,
      network: input.network || null,
      amount: Number.parseFloat(input.amount || input.revenue || payload.revenue || '0') || null,
      currency: input.currency || payload.currency || content.currency || null,
      recipientWallet: input.recipient || input.payTo || content.recipientWallet || null,
      status: input.status || 'verified',
      metadata: JSON.stringify(payload).slice(0, 12000)
    },
    create: {
      contentId: content.id,
      websiteId: website.id,
      publisherId: content.publisherId || null,
      payerWallet: walletFromPayload(payload) || null,
      actor: input.actor || payload.actor || null,
      paymentId,
      paymentProvider: input.paymentProvider || input.provider || null,
      txHash: input.txHash || input.transactionHash || input.transaction || null,
      receiptUrl: input.receiptUrl || null,
      chainId: input.chainId ? String(input.chainId) : null,
      network: input.network || null,
      amount: Number.parseFloat(input.amount || input.revenue || payload.revenue || '0') || null,
      currency: input.currency || payload.currency || content.currency || null,
      recipientWallet: input.recipient || input.payTo || content.recipientWallet || null,
      status: input.status || 'verified',
      metadata: JSON.stringify(payload).slice(0, 12000)
    }
  });
}

function ratingValueFromPayload(payload = {}) {
  const input = paymentPayload(payload);
  const raw = input.ratingValue ?? input.rating ?? input.stars ?? input.score;
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return null;
  const value = numeric <= 5 ? Math.round(numeric * 10) : Math.round(numeric);
  return Math.max(1, Math.min(50, value));
}

function ratingMessageFor(website, content, ratingValue) {
  return [
    'Nibgate content rating',
    `site:${website.domain}`,
    `content:${content.externalId || content.id}`,
    `url:${content.url}`,
    `rating:${ratingValue}`,
    'I confirm this rating is tied to my unlock/payment proof.'
  ].join('\n');
}

const CONTENT_RATED_EVENT = {
  type: 'event',
  name: 'ContentRated',
  inputs: [
    { indexed: true, name: 'contentId', type: 'bytes32' },
    { indexed: true, name: 'rater', type: 'address' },
    { indexed: false, name: 'rating', type: 'uint8' },
    { indexed: false, name: 'reviewHash', type: 'bytes32' },
    { indexed: false, name: 'proof', type: 'string' }
  ]
};

const CONTENT_HASH_NAMESPACE = 'nibgate:content:v1';

function contentHashFor(website, content) {
  return keccak256(stringToBytes([
    CONTENT_HASH_NAMESPACE,
    cleanDomain(website.domain),
    content.externalId || content.id,
    content.url
  ].join('|')));
}

function publicClientForIndexer() {
  const rpcUrl = process.env.NIBGATE_REPUTATION_RPC_URL || process.env.ARC_TESTNET_RPC_URL || process.env.RPC_URL || DEFAULT_NIBGATE_REPUTATION_RPC_URL;
  const chainId = Number.parseInt(process.env.NIBGATE_REPUTATION_CHAIN_ID || process.env.CHAIN_ID || '5042002', 10);
  if (!rpcUrl) return null;
  return createPublicClient({
    chain: {
      id: chainId,
      name: process.env.NIBGATE_REPUTATION_CHAIN_NAME || 'Arc Testnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    },
    transport: http(rpcUrl)
  });
}

async function verifySignedRating(website, content, payload = {}, walletAddress = '', ratingValue = 0) {
  const input = paymentPayload(payload);
  const signature = input.signature || input.ratingSignature || '';
  const suppliedMessage = input.message || input.ratingMessage || '';
  if (!signature) return { ok: false, status: 'missing_signature', proofType: input.txHash ? 'onchain_pending' : 'signed' };

  const expectedMessage = ratingMessageFor(website, content, ratingValue);
  if (suppliedMessage && suppliedMessage !== expectedMessage) {
    return { ok: false, status: 'message_mismatch', proofType: 'signed' };
  }

  try {
    const ok = await verifyMessage({
      address: walletAddress,
      message: expectedMessage,
      signature
    });
    return { ok, status: ok ? 'accepted' : 'invalid_signature', proofType: 'signed', proof: signature, message: expectedMessage };
  } catch {
    return { ok: false, status: 'invalid_signature', proofType: 'signed' };
  }
}

async function upsertContentRating(website, content, payload = {}, eventName = '') {
  if (!content || !['content_rating', 'rating_submitted', 'rating_completed'].includes(eventName)) return null;
  const walletAddress = walletFromPayload(payload);
  const ratingValue = ratingValueFromPayload(payload);
  if (!walletAddress || !ratingValue) return null;

  const proof = paymentPayload(payload);
  const hasUnlock = await db.unlockReceipt.findFirst({
    where: {
      contentId: content.id,
      OR: [
        { payerWallet: walletAddress },
        ...(proof.paymentId ? [{ paymentId: String(proof.paymentId) }] : []),
        ...(proof.txHash ? [{ txHash: String(proof.txHash) }] : [])
      ]
    }
  });

  if (!hasUnlock && !proof.proof && !proof.txHash) return null;
  const signedProof = await verifySignedRating(website, content, payload, walletAddress, ratingValue);
  const status = signedProof.ok ? 'accepted' : (proof.txHash ? 'pending_onchain_verification' : signedProof.status);
  if (status !== 'accepted' && status !== 'pending_onchain_verification') return null;

  return db.contentRating.upsert({
    where: { contentId_walletAddress: { contentId: content.id, walletAddress } },
    update: {
      publisherId: content.publisherId || null,
      actor: proof.actor || payload.actor || null,
      ratingValue,
      reviewHash: proof.reviewHash || null,
      txHash: proof.txHash || proof.transactionHash || null,
      proofType: signedProof.proofType || proof.proofType || (proof.txHash ? 'onchain_pending' : 'signed'),
      proof: signedProof.proof || proof.proof || proof.paymentId || null,
      status,
      metadata: JSON.stringify(payload).slice(0, 12000)
    },
    create: {
      contentId: content.id,
      websiteId: website.id,
      publisherId: content.publisherId || null,
      walletAddress,
      actor: proof.actor || payload.actor || null,
      ratingValue,
      reviewHash: proof.reviewHash || null,
      txHash: proof.txHash || proof.transactionHash || null,
      proofType: signedProof.proofType || proof.proofType || (proof.txHash ? 'onchain_pending' : 'signed'),
      proof: signedProof.proof || proof.proof || proof.paymentId || null,
      status,
      metadata: JSON.stringify(payload).slice(0, 12000)
    }
  });
}

async function upsertOnchainRatingForContent(content, matched, txHash) {
  const walletAddress = String(matched.rater || '').toLowerCase();
  if (!walletAddress) return { ok: false, reason: 'missing_rater' };

  const unlock = await db.unlockReceipt.findFirst({
    where: {
      contentId: content.id,
      OR: [
        { payerWallet: walletAddress },
        ...(matched.proof ? [{ paymentId: String(matched.proof) }] : []),
        ...(matched.proof ? [{ txHash: String(matched.proof) }] : [])
      ]
    }
  });
  if (!unlock) return { ok: false, reason: 'missing_unlock_receipt' };

  const ratingValue = Math.max(1, Math.min(50, Number(matched.rating || 0)));
  const rating = await db.contentRating.upsert({
    where: { contentId_walletAddress: { contentId: content.id, walletAddress } },
    update: {
      publisherId: content.publisherId || null,
      ratingValue,
      txHash,
      reviewHash: String(matched.reviewHash || ''),
      proofType: 'onchain',
      proof: String(matched.proof || ''),
      status: 'accepted',
      metadata: JSON.stringify({ txHash, log: matched }).slice(0, 12000)
    },
    create: {
      contentId: content.id,
      websiteId: content.websiteId,
      publisherId: content.publisherId || null,
      walletAddress,
      ratingValue,
      txHash,
      reviewHash: String(matched.reviewHash || ''),
      proofType: 'onchain',
      proof: String(matched.proof || ''),
      status: 'accepted',
      metadata: JSON.stringify({ txHash, log: matched }).slice(0, 12000)
    }
  });

  return { ok: true, rating };
}

async function findContentByHash(contentHash) {
  const contents = await db.content.findMany({
    include: { website: true, publisher: true }
  });
  return contents.find((content) => contentHashFor(content.website, content).toLowerCase() === String(contentHash || '').toLowerCase()) || null;
}

function extractOriginHostname(req, payload = {}) {
  const candidate = req.headers.origin || req.headers.referer || payload.url || '';
  try {
    return new URL(candidate).host;
  } catch {
    return '';
  }
}

async function fetchHomeHtml(domain) {
  const response = await fetch(originFor(domain), {
    headers: { accept: 'text/html' }
  });
  if (!response.ok) {
    throw new Error(`Homepage returned ${response.status}`);
  }
  return response.text();
}

function htmlContainsTrackingScript(html, website) {
  const sitePattern = new RegExp(`data-nibgate-site=["']${website.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
  const tokenPattern = new RegExp(`data-nibgate-token=["']${website.verifyToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
  const scriptPattern = /<script\b[^>]+src=["'][^"']*\/widget\.js[^"']*["'][^>]*>/i;
  return scriptPattern.test(html) && sitePattern.test(html) && tokenPattern.test(html);
}


function contentReputationScoreFromMetrics({ views = 0, unlocks = 0, revenue = 0, avgDurationMs = 0 } = {}) {
  const safeViews = Math.max(0, views || 0);
  const safeUnlocks = Math.max(0, unlocks || 0);
  const safeRevenue = Math.max(0, revenue || 0);
  const safeAvgDurationMs = Math.max(0, avgDurationMs || 0);
  const unlockRate = safeViews > 0 ? safeUnlocks / safeViews : 0;
  const score = 42 + Math.min(18, safeViews * 0.4) + Math.min(22, unlockRate * 110) + Math.min(10, safeRevenue * 70) + Math.min(8, safeAvgDurationMs / 15000);
  return Math.max(0, Math.min(99, Math.round(score)));
}

function contentReputationStars(score = 0) {
  return Math.max(0, Math.min(5, Math.round(((score || 0) / 20) * 10) / 10));
}

function ratingAverage(ratings = []) {
  const accepted = ratings.filter((rating) => rating.status === 'accepted' && Number.isFinite(rating.ratingValue));
  if (!accepted.length) return 0;
  return Math.round((accepted.reduce((sum, rating) => sum + rating.ratingValue, 0) / accepted.length / 10) * 10) / 10;
}

function average(values = []) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function siteReputationScore(contents = [], website = {}) {
  const contentScores = contents.map((content) => content.reputationScore || 0).filter(Boolean);
  const avgContent = average(contentScores);
  const verification = website.isVerified && website.verificationStatus === 'verified' ? 12 : 0;
  const depth = Math.min(10, contentScores.length * 2);
  const score = avgContent ? avgContent * 0.78 + verification + depth : verification + depth;
  return Math.max(1, Math.min(100, Math.round(score || 1)));
}

function creatorReputationScore(contents = [], websites = []) {
  const contentScores = contents.map((content) => content.reputationScore || 0).filter(Boolean);
  const avgContent = average(contentScores);
  const verifiedSites = websites.filter((website) => website.isVerified && website.verificationStatus === 'verified').length;
  const siteDepth = Math.min(12, verifiedSites * 4);
  const contentDepth = Math.min(12, contentScores.length * 1.5);
  const score = avgContent ? avgContent * 0.76 + siteDepth + contentDepth : siteDepth + contentDepth;
  return Math.max(1, Math.min(100, Math.round(score || 1)));
}

function serializeContent(content) {
  const metrics = Array.isArray(content.metrics) ? content.metrics : [];
  const ratings = Array.isArray(content.ratings) ? content.ratings : [];
  const unlockReceipts = Array.isArray(content.unlockReceipts) ? content.unlockReceipts : [];
  const views = metrics.filter((metric) => metric.type === 'view').length;
  const unlocks = metrics.filter((metric) => metric.type === 'unlock' && ['resource_unlock', 'unlock_completed', 'unlock'].includes(metric.eventName || metric.type)).length;
  const revenue = metrics.reduce((total, metric) => total + (metric.revenue || 0), 0);
  const timeEvents = metrics.filter((metric) => metric.durationMs);
  const avgDurationMs = timeEvents.length
    ? Math.round(timeEvents.reduce((total, metric) => total + (metric.durationMs || 0), 0) / timeEvents.length)
    : 0;

  const explicitStars = ratingAverage(ratings);
  const metricScore = contentReputationScoreFromMetrics({ views, unlocks, revenue, avgDurationMs });
  const reputationStars = explicitStars || contentReputationStars(metricScore);
  const reputationScore = explicitStars ? Math.round(explicitStars * 20) : metricScore;

  return {
    id: content.id,
    websiteId: content.websiteId,
    websiteName: content.website?.name || '',
    websiteDomain: content.website?.domain || '',
    websiteVerified: content.website?.isVerified || false,
    websiteVerificationStatus: content.website?.verificationStatus || '',
    websiteFaviconUrl: content.website?.faviconUrl || '',
    websiteOgImageUrl: content.website?.ogImageUrl || '',
    title: content.title,
    description: content.description || '',
    imageUrl: content.imageUrl || '',
    contentType: content.contentType,
    tags: content.tags || '',
    tagList: cleanTags(content.tags),
    url: content.url,
    path: content.path || '',
    currency: content.currency || 'USDC',
    price: content.price,
    recipientWallet: content.recipientWallet || '',
    publisher: content.publisher ? {
      id: content.publisher.id,
      externalId: content.publisher.externalId,
      handle: content.publisher.handle || '',
      name: content.publisher.name || '',
      walletAddress: content.publisher.walletAddress || '',
      profileUrl: content.publisher.profileUrl || '',
      verification: content.publisher.verification || 'platform_attested'
    } : {
      id: content.publisherId || '',
      externalId: content.publisherExternalId || '',
      handle: content.publisherHandle || '',
      name: '',
      walletAddress: content.publisherWallet || '',
      profileUrl: content.publisherProfileUrl || '',
      verification: content.publisherVerification || ''
    },
    publisherId: content.publisherId || '',
    publisherExternalId: content.publisherExternalId || '',
    publisherHandle: content.publisherHandle || '',
    publisherWallet: content.publisherWallet || '',
    publisherProfileUrl: content.publisherProfileUrl || '',
    publisherVerification: content.publisherVerification || '',
    accessPolicy: content.accessPolicy || '',
    unlockPolicy: content.unlockPolicy || '',
    externalId: content.externalId || '',
    lastSeenAt: content.lastSeenAt || null,
    createdAt: content.createdAt,
    metrics: content._count?.metrics || metrics.length || 0,
    views,
    unlocks,
    revenue,
    avgDurationMs,
    receipts: content._count?.unlockReceipts || unlockReceipts.length || 0,
    ratings: content._count?.ratings || ratings.length || 0,
    reputationScore,
    reputationStars
  };
}

function parseMetricMetadata(metric) {
  if (!metric?.metadata) return {};
  try {
    const parsed = JSON.parse(metric.metadata);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function paymentFieldsFromMetric(metric) {
  const metadata = parseMetricMetadata(metric);
  const payment = metadata.payment && typeof metadata.payment === 'object' ? metadata.payment : {};
  const provider = metadata.paymentProvider || payment.paymentProvider || metadata.provider || payment.provider || '';
  const txHash = metadata.txHash || payment.txHash || metadata.transactionHash || payment.transactionHash || '';
  const receiptUrl = metadata.receiptUrl || payment.receiptUrl || '';
  const chainExplorerUrl = metadata.chainExplorerUrl || payment.chainExplorerUrl || '';
  const chainId = metadata.chainId || payment.chainId || '';

  return {
    paymentId: metadata.paymentId || payment.paymentId || metadata.id || payment.id || '',
    paymentProvider: provider,
    receiptUrl,
    txHash,
    chainId,
    chainExplorerUrl,
    payer: metadata.payer || payment.payer || metadata.buyer || payment.buyer || '',
    recipient: metadata.recipient || payment.recipient || metadata.payTo || payment.payTo || '',
    network: metadata.network || payment.network || chainId || provider || '',
    status: metadata.status || payment.status || 'settled'
  };
}

function primaryWalletAddress(user) {
  return user.wallets?.find((wallet) => wallet.isPrimary)?.address || user.wallets?.[0]?.address || user.walletAddress || '';
}

async function runVerificationSweep() {
  const intervalMs = Number.parseInt(process.env.VERIFICATION_CHECK_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10);
  const staleBefore = new Date(Date.now() - intervalMs);
  const websites = await db.website.findMany({
    where: {
      deletedAt: null,
      isVerified: true,
      verificationStatus: 'verified',
      OR: [
        { lastVerificationCheckAt: null },
        { lastVerificationCheckAt: { lt: staleBefore } }
      ]
    },
    take: Number.parseInt(process.env.VERIFICATION_CHECK_BATCH_SIZE || '25', 10)
  });

  for (const website of websites) {
    const result = await checkWebsiteVerification(website);
    await db.website.update({
      where: { id: website.id },
      data: result.data
    }).catch((error) => {
      console.log(`Verification sweep failed for ${website.domain}:`, error.message);
    });
  }
}

function startVerificationMonitor() {
  if (verificationMonitorStarted || process.env.VERIFICATION_CHECKS_DISABLED === 'true') return;
  verificationMonitorStarted = true;

  const intervalMs = Number.parseInt(process.env.VERIFICATION_CHECK_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10);
  const initialDelayMs = Number.parseInt(process.env.VERIFICATION_CHECK_INITIAL_DELAY_MS || String(10 * 60 * 1000), 10);

  setTimeout(() => {
    runVerificationSweep().catch((error) => console.log('Verification sweep failed:', error.message));
    setInterval(() => {
      runVerificationSweep().catch((error) => console.log('Verification sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}

async function syncWebsiteManifest(website) {
  const urls = manifestCandidateUrls(website);
  let lastError = '';

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.parseInt(process.env.MANIFEST_SYNC_FETCH_TIMEOUT_MS || '5000', 10));
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        lastError = `${url} returned ${response.status}`;
        continue;
      }

      const manifest = await response.json();
      const resources = resourcesFromManifest(manifest);
      if (!resources.length) {
        lastError = `${url} had no content`;
        continue;
      }

      const upserted = [];
      for (const resource of resources) {
        const content = await upsertTrackedContent(website, {
          event: 'content_registered',
          resource,
          url: resource.url,
          path: resource.path || resource.route
        });
        if (content) upserted.push(content);
      }

      await db.website.update({
        where: { id: website.id },
        data: {
          lastScanAt: new Date(),
          lastSyncAt: new Date(),
          lastScanStatus: 'synced',
          lastScanError: null
        }
      }).catch(() => {});

      return { ok: true, url, content: upserted.length };
    } catch (error) {
      lastError = `${url}: ${error.message}`;
    } finally {
      clearTimeout(timeout);
    }
  }

  await db.website.update({
    where: { id: website.id },
    data: {
      lastScanAt: new Date(),
      lastScanStatus: 'failed',
      lastScanError: lastError || 'No Nibgate manifest found.'
    }
  }).catch(() => {});

  return { ok: false, error: lastError || 'No Nibgate manifest found.' };
}

async function runManifestSyncSweep() {
  const retryAfterMs = Number.parseInt(process.env.MANIFEST_SYNC_RETRY_AFTER_MS || String(30 * 60 * 1000), 10);
  const retryAfter = new Date(Date.now() - retryAfterMs);
  const websites = await db.website.findMany({
    where: {
      deletedAt: null,
      isVerified: true,
      verificationStatus: 'verified',
      OR: [
        { lastScanStatus: null },
        { lastScanStatus: { not: 'failed' } },
        { lastScanAt: { lt: retryAfter } }
      ]
    },
    orderBy: [
      { lastScanAt: 'asc' },
      { createdAt: 'desc' }
    ],
    take: Number.parseInt(process.env.MANIFEST_SYNC_BATCH_SIZE || '100', 10)
  });

  for (const website of websites) {
    const result = await syncWebsiteManifest(website);
    if (!result.ok && process.env.MANIFEST_SYNC_LOG_FAILURES !== 'false') {
      console.log(`Manifest sync failed for ${website.domain}: ${result.error}`);
    }
  }
}

function startManifestSyncMonitor() {
  if (manifestSyncMonitorStarted || process.env.MANIFEST_SYNC_DISABLED === 'true') return;
  manifestSyncMonitorStarted = true;

  const intervalMs = Number.parseInt(process.env.MANIFEST_SYNC_INTERVAL_MS || String(15 * 60 * 1000), 10);
  const initialDelayMs = Number.parseInt(process.env.MANIFEST_SYNC_INITIAL_DELAY_MS || '15000', 10);

  setTimeout(() => {
    runManifestSyncSweep().catch((error) => console.log('Manifest sync sweep failed:', error.message));
    setInterval(() => {
      runManifestSyncSweep().catch((error) => console.log('Manifest sync sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}

async function indexReputationLog(log, contractAddress) {
  if (String(log.address || '').toLowerCase() !== contractAddress) return { ok: false, reason: 'wrong_contract' };

  let decoded;
  try {
    decoded = decodeEventLog({
      abi: [CONTENT_RATED_EVENT],
      data: log.data,
      topics: log.topics
    });
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }

  if (decoded.eventName !== 'ContentRated') return { ok: false, reason: 'wrong_event' };

  const content = await findContentByHash(decoded.args.contentId);
  if (!content) return { ok: false, reason: 'content_not_found' };

  return upsertOnchainRatingForContent(content, decoded.args, log.transactionHash);
}

async function runReputationIndexSweep() {
  const contractAddress = String(process.env.NIBGATE_REPUTATION_CONTRACT || DEFAULT_NIBGATE_REPUTATION_CONTRACT).toLowerCase();
  if (!contractAddress) return { ok: false, reason: 'missing_contract' };

  const client = publicClientForIndexer();
  if (!client) return { ok: false, reason: 'missing_rpc' };

  const latestBlock = await client.getBlockNumber();
  const backfillBlocks = BigInt(Number.parseInt(process.env.NIBGATE_REPUTATION_BACKFILL_BLOCKS || '5000', 10));
  const fromBlock = reputationIndexerLastBlock === null
    ? latestBlock > backfillBlocks ? latestBlock - backfillBlocks : 0n
    : reputationIndexerLastBlock + 1n;
  const toBlock = latestBlock;
  if (fromBlock > toBlock) return { ok: true, indexed: 0, fromBlock: String(fromBlock), toBlock: String(toBlock) };

  const logs = await client.getLogs({
    address: contractAddress,
    event: CONTENT_RATED_EVENT,
    fromBlock,
    toBlock
  });

  let indexed = 0;
  for (const log of logs) {
    const result = await indexReputationLog(log, contractAddress);
    if (result.ok) indexed += 1;
  }

  reputationIndexerLastBlock = toBlock;
  return { ok: true, indexed, fromBlock: String(fromBlock), toBlock: String(toBlock) };
}

function startReputationIndexer() {
  if (reputationIndexerStarted || process.env.NIBGATE_REPUTATION_INDEXER_DISABLED === 'true') return;
  reputationIndexerStarted = true;

  const intervalMs = Number.parseInt(process.env.NIBGATE_REPUTATION_INDEX_INTERVAL_MS || '30000', 10);
  const initialDelayMs = Number.parseInt(process.env.NIBGATE_REPUTATION_INDEX_INITIAL_DELAY_MS || '10000', 10);

  setTimeout(() => {
    runReputationIndexSweep().catch((error) => console.log('Reputation index sweep failed:', error.message));
    setInterval(() => {
      runReputationIndexSweep().catch((error) => console.log('Reputation index sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}

export function registerHubRoutes(app) {
  startVerificationMonitor();
  startManifestSyncMonitor();
  startReputationIndexer();
  
  // 1. Dashboard: Register a new Website
  async function registerWebsite(req, res) {
    const { domain, name, description } = req.body;
    const cleanedDomain = cleanDomain(domain);
    const siteName = String(name || '').trim();
    const siteDescription = typeof description === 'string' ? description.trim() : '';

    try {
      if (!cleanedDomain || !siteName) {
        return res.status(400).json({ error: 'Domain and Name are required' });
      }
      if (!isValidDomain(cleanedDomain)) {
        return res.status(400).json({ error: 'Enter a valid domain, for example creator.example.com' });
      }

      const verifyToken = crypto.randomBytes(16).toString('hex');
      const siteToken = crypto.randomBytes(24).toString('hex');

      const website = await db.website.create({
        data: {
          domain: cleanedDomain,
          name: siteName,
          description: siteDescription || null,
          ownerId: req.user.id,
          verifyToken,
          siteToken,
          isVerified: false,
          verificationStatus: 'pending'
        }
      });

      res.json({ success: true, website: serializeWebsite(website) });
    } catch (error) {
      if (error.code === 'P2002') {
        const ownedWebsite = await db.website.findFirst({
          where: {
            domain: cleanDomain(req.body.domain),
            ownerId: req.user.id
          },
          include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } }
        });

        if (ownedWebsite?.deletedAt) {
          const restoredWebsite = await db.website.update({
            where: { id: ownedWebsite.id },
            data: {
              name: siteName,
              description: siteDescription || ownedWebsite.description || null,
              verifyToken: crypto.randomBytes(16).toString('hex'),
              siteToken: crypto.randomBytes(24).toString('hex'),
              isVerified: false,
              verificationStatus: 'pending',
              lastVerifiedAt: null,
              lastVerificationCheckAt: null,
              verificationFailureReason: null,
              deletedAt: null,
              lastSyncAt: null
            },
            include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } }
          });

          return res.json({
            success: true,
            restored: true,
            website: serializeWebsite(restoredWebsite)
          });
        }

        if (ownedWebsite) {
          return res.json({
            success: true,
            alreadyExisted: true,
            website: serializeWebsite(ownedWebsite)
          });
        }

        return res.status(400).json({ error: 'Domain is already registered' });
      }
      res.status(500).json({ error: 'Failed to register website', details: error.message });
    }
  }

  app.post('/api/hub/site/register', requireAuth, registerWebsite);
  app.post('/api/hub/sites/register', requireAuth, registerWebsite);

  // 2. Dashboard: Verify Website Ownership
  async function verifyWebsite(req, res) {
    try {
      const websiteId = req.body.websiteId || req.params.websiteId;
      const website = await db.website.findFirst({
        where: { id: websiteId, ownerId: req.user.id, deletedAt: null }
      });

      if (!website) {
        return res.status(404).json({ error: 'Website not found' });
      }
      const result = await checkWebsiteVerification(website);
      const updatedWebsite = await db.website.update({
        where: { id: website.id },
        data: result.data,
        include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } }
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.reason, status: result.status, website: serializeWebsite(updatedWebsite) });
      }

      return res.json({ success: true, verified: true, website: serializeWebsite(updatedWebsite) });
    } catch (error) {
      res.status(500).json({ error: 'Verification process failed' });
    }
  }

  app.post('/api/hub/site/verify', requireAuth, verifyWebsite);
  app.post('/api/hub/sites/:websiteId/verify', requireAuth, verifyWebsite);
  app.post('/api/hub/sites/:websiteId/recheck', requireAuth, verifyWebsite);

  app.post('/api/hub/sites/:websiteId/sync', requireAuth, async (req, res) => {
    try {
      const website = await db.website.findFirst({
        where: { id: req.params.websiteId, ownerId: req.user.id, deletedAt: null }
      });
      if (!website) return res.status(404).json({ error: 'Website not found' });
      if (!website.isVerified || website.verificationStatus !== 'verified') {
        return res.status(400).json({ error: 'Verify this site before syncing content.' });
      }

      const result = await syncWebsiteManifest(website);
      if (!result.ok) return res.status(400).json({ error: result.error || 'Manifest sync failed' });
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to sync site manifest', details: error.message });
    }
  });

  app.post('/api/hub/reputation/ratings/sync', async (req, res) => {
    try {
      const expectedSecret = process.env.NIBGATE_INDEXER_SECRET || '';
      if (expectedSecret && req.headers['x-nibgate-indexer-secret'] !== expectedSecret) {
        return res.status(401).json({ error: 'Invalid indexer secret' });
      }
      const result = await runReputationIndexSweep();
      if (!result.ok) return res.status(400).json({ error: result.reason || 'Reputation sync failed' });
      return res.json({ success: true, ...result });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to sync onchain reputation', details: error.message });
    }
  });

  app.options('/api/hub/track', (_req, res) => res.status(204).end());
  app.post('/api/hub/track', async (req, res) => {
    try {
      const siteId = String(req.body.siteId || req.body.site || '').trim();
      const token = String(req.body.token || '').trim();

      if (!siteId || !token) {
        return res.status(400).json({ error: 'Missing siteId or token' });
      }

      const website = await db.website.findFirst({
        where: { id: siteId, verifyToken: token, deletedAt: null, isVerified: true, verificationStatus: 'verified' }
      });

      if (!website) {
        return res.status(401).json({ error: 'Invalid tracking token' });
      }

      const originHostname = extractOriginHostname(req, req.body);
      if (originHostname && !hostnameMatchesSite(originHostname, website.domain)) {
        return res.status(403).json({ error: 'Tracking origin does not match this site' });
      }

      const eventName = cleanEventName(req.body.event);
      const content = await upsertTrackedContent(website, { ...req.body, event: eventName });
      await upsertUnlockReceipt(website, content, { ...req.body, event: eventName }, eventName);
      await upsertContentRating(website, content, { ...req.body, event: eventName }, eventName);
      const metricType = eventTypeFor(eventName);
      const revenue = Number.parseFloat(req.body.revenue || req.body.amount || '0') || null;
      const metadata = { ...req.body };
      delete metadata.siteId;
      delete metadata.site;
      delete metadata.token;
      delete metadata.resource;

      await db.metric.create({
        data: {
          websiteId: website.id,
          contentId: content?.id || null,
          publisherId: content?.publisherId || null,
          type: metricType,
          eventName,
          revenue: ['unlock', 'payment'].includes(metricType) ? revenue : null,
          currency: req.body.currency || req.body.payment?.currency || null,
          path: req.body.path || null,
          url: req.body.url || null,
          referrer: req.body.referrer || null,
          userAgent: req.headers['user-agent'] || null,
          visitorId: req.body.visitorId || null,
          sessionId: req.body.sessionId || null,
          durationMs: intOrNull(req.body.durationMs),
          scrollDepth: numberOrNull(req.body.scrollDepth),
          metadata: JSON.stringify(metadata).slice(0, 12000)
        }
      });

      await db.website.update({
        where: { id: website.id },
        data: { lastSyncAt: new Date() }
      }).catch(() => {});

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Track failed', details: error.message });
    }
  });

  // 3. API: Dashboard Websites List
  app.get('/api/hub/sites', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ success: true, websites: websites.map(serializeWebsite) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch websites' });
    }
  });

  app.delete('/api/hub/sites/:websiteId', requireAuth, async (req, res) => {
    try {
      const website = await db.website.findFirst({
        where: {
          id: req.params.websiteId,
          ownerId: req.user.id,
          deletedAt: null
        },
        include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } }
      });

      if (!website) {
        return res.status(404).json({ error: 'Website not found' });
      }

      const updatedWebsite = await db.website.update({
        where: { id: website.id },
        data: {
          deletedAt: new Date(),
          isVerified: false,
          verificationStatus: 'removed',
          verificationFailureReason: 'Site removed by creator.'
        },
        include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } }
      });

      res.json({ success: true, website: serializeWebsite(updatedWebsite) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove website' });
    }
  });

  app.get('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    const websites = await db.website.findMany({
      where: { ownerId: req.user.id, deletedAt: null },
      include: { content: { include: { publisher: true, metrics: true, website: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } } }
    });
    const publishers = await db.publisherIdentity.findMany({
      where: { website: { ownerId: req.user.id, deletedAt: null } },
      include: {
        website: true,
        _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });
    const serializedContent = websites.flatMap((website) => website.content.map(serializeContent));
    const creatorReputation = creatorReputationScore(serializedContent, websites);
    res.json({
      success: true,
      profile: {
        id: req.user.id,
        walletAddress: primaryWalletAddress(req.user),
        username: req.user.username || '',
        bio: req.user.bio || '',
        avatarUrl: req.user.avatarUrl || '',
        coverUrl: req.user.coverUrl || '',
        websiteUrl: req.user.websiteUrl || '',
        twitterUrl: req.user.twitterUrl || '',
        instagramUrl: req.user.instagramUrl || '',
        tiktokUrl: req.user.tiktokUrl || '',
        youtubeUrl: req.user.youtubeUrl || '',
        creatorReputation,
        verifiedSites: websites.filter((website) => website.isVerified && website.verificationStatus === 'verified').length,
        publisherIdentities: publishers.map(serializePublisherIdentity),
        trackedContent: serializedContent.length,
        createdAt: req.user.createdAt
      }
    });
  });

  app.get('/api/hub/dashboard/publishers', requireAuth, async (req, res) => {
    try {
      const publishers = await db.publisherIdentity.findMany({
        where: { website: { ownerId: req.user.id, deletedAt: null } },
        include: {
          website: true,
          _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } }
        },
        orderBy: { updatedAt: 'desc' }
      });

      res.json({ success: true, publishers: publishers.map(serializePublisherIdentity) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch publisher identities' });
    }
  });

  app.put('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    try {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : '';
      const avatarUrl = typeof req.body.avatarUrl === 'string' ? req.body.avatarUrl.trim() : '';
      const coverUrl = typeof req.body.coverUrl === 'string' ? req.body.coverUrl.trim() : '';
      const websiteUrl = typeof req.body.websiteUrl === 'string' ? req.body.websiteUrl.trim() : '';
      const twitterUrl = typeof req.body.twitterUrl === 'string' ? req.body.twitterUrl.trim() : '';
      const instagramUrl = typeof req.body.instagramUrl === 'string' ? req.body.instagramUrl.trim() : '';
      const tiktokUrl = typeof req.body.tiktokUrl === 'string' ? req.body.tiktokUrl.trim() : '';
      const youtubeUrl = typeof req.body.youtubeUrl === 'string' ? req.body.youtubeUrl.trim() : '';

      const user = await db.user.update({
        where: { id: req.user.id },
        data: {
          username: username || null,
          bio: bio || null,
          avatarUrl: avatarUrl || null,
          coverUrl: coverUrl || null,
          websiteUrl: websiteUrl || null,
          twitterUrl: twitterUrl || null,
          instagramUrl: instagramUrl || null,
          tiktokUrl: tiktokUrl || null,
          youtubeUrl: youtubeUrl || null
        },
        include: {
          wallets: {
            orderBy: [
              { isPrimary: 'desc' },
              { createdAt: 'asc' }
            ]
          }
        }
      });

      await Promise.allSettled([
        req.user.avatarUrl && req.user.avatarUrl !== user.avatarUrl ? deleteManagedProfileImage(req.user.avatarUrl) : null,
        req.user.coverUrl && req.user.coverUrl !== user.coverUrl ? deleteManagedProfileImage(req.user.coverUrl) : null
      ].filter(Boolean));

      res.json({
        success: true,
        profile: {
          id: user.id,
          walletAddress: primaryWalletAddress(user),
          username: user.username || '',
          bio: user.bio || '',
          avatarUrl: user.avatarUrl || '',
          coverUrl: user.coverUrl || '',
          websiteUrl: user.websiteUrl || '',
          twitterUrl: user.twitterUrl || '',
          instagramUrl: user.instagramUrl || '',
          tiktokUrl: user.tiktokUrl || '',
          youtubeUrl: user.youtubeUrl || '',
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.get('/api/hub/dashboard/content', requireAuth, async (req, res) => {
    try {
      const metricDateWhere = dateRangeWhere(req);
      const content = await db.content.findMany({
        where: {
          website: { ownerId: req.user.id, deletedAt: null, isVerified: true }
        },
        include: {
          website: true,
          publisher: true,
          metrics: { where: metricDateWhere },
          ratings: true,
          unlockReceipts: true,
          _count: { select: { metrics: true, unlockReceipts: true, ratings: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        content: content.map(serializeContent)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch content' });
    }
  });

  app.post('/api/hub/content/:contentId/rate', requireAuth, async (req, res) => {
    try {
      const content = await db.content.findFirst({
        where: {
          id: req.params.contentId,
          website: { deletedAt: null, isVerified: true }
        },
        include: { website: true, publisher: true }
      });
      if (!content) return res.status(404).json({ error: 'Content not found' });

      const walletAddress = primaryWalletAddress(req.user).toLowerCase();
      if (!walletAddress) return res.status(401).json({ error: 'Connect a wallet before rating content.' });

      const ratingValue = ratingValueFromPayload(req.body);
      if (!ratingValue) return res.status(400).json({ error: 'Rating must be between 0.1 and 5 stars.' });

      const receipt = await db.unlockReceipt.findFirst({
        where: {
          contentId: content.id,
          payerWallet: walletAddress
        }
      });
      if (!receipt) {
        return res.status(403).json({ error: 'Unlock this content before rating it.' });
      }

      const signedProof = await verifySignedRating(content.website, content, req.body, walletAddress, ratingValue);
      if (!signedProof.ok) {
        return res.status(400).json({
          error: 'Sign the Nibgate rating message with the wallet that unlocked this content.',
          status: signedProof.status,
          message: ratingMessageFor(content.website, content, ratingValue)
        });
      }

      const rating = await db.contentRating.upsert({
        where: { contentId_walletAddress: { contentId: content.id, walletAddress } },
        update: {
          publisherId: content.publisherId || null,
          ratingValue,
          actor: req.body.actor || 'human',
          reviewHash: req.body.reviewHash || null,
          txHash: req.body.txHash || null,
          proofType: 'signed',
          proof: signedProof.proof,
          status: 'accepted',
          metadata: JSON.stringify(req.body).slice(0, 12000)
        },
        create: {
          contentId: content.id,
          websiteId: content.websiteId,
          publisherId: content.publisherId || null,
          walletAddress,
          ratingValue,
          actor: req.body.actor || 'human',
          reviewHash: req.body.reviewHash || null,
          txHash: req.body.txHash || null,
          proofType: 'signed',
          proof: signedProof.proof,
          status: 'accepted',
          metadata: JSON.stringify(req.body).slice(0, 12000)
        }
      });

      res.json({
        success: true,
        rating: {
          id: rating.id,
          contentId: rating.contentId,
          walletAddress: rating.walletAddress,
          rating: rating.ratingValue / 10,
          ratingValue: rating.ratingValue,
          status: rating.status
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to rate content', details: error.message });
    }
  });

  app.post('/api/hub/reputation/ratings/prepare', async (req, res) => {
    try {
      const siteId = String(req.body.siteId || req.body.site || '').trim();
      const token = String(req.body.token || '').trim();
      if (!siteId || !token) return res.status(400).json({ error: 'siteId and token are required' });

      const website = await db.website.findFirst({
        where: { id: siteId, verifyToken: token, deletedAt: null, isVerified: true, verificationStatus: 'verified' }
      });
      if (!website) return res.status(401).json({ error: 'Invalid tracking token' });

      const originHostname = extractOriginHostname(req, req.body);
      if (originHostname && !hostnameMatchesSite(originHostname, website.domain)) {
        return res.status(403).json({ error: 'Tracking origin does not match this site' });
      }

      const content = await upsertTrackedContent(website, { ...req.body, event: 'content_registered' });
      if (!content) return res.status(400).json({ error: 'resource is required' });

      return res.json({
        success: true,
        contentId: content.id,
        contentHash: contentHashFor(website, content),
        websiteId: website.id,
        domain: website.domain
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to prepare onchain rating', details: error.message });
    }
  });

  app.post('/api/hub/reputation/ratings/index', async (req, res) => {
    try {
      const expectedSecret = process.env.NIBGATE_INDEXER_SECRET || '';
      if (expectedSecret && req.headers['x-nibgate-indexer-secret'] !== expectedSecret) {
        return res.status(401).json({ error: 'Invalid indexer secret' });
      }

      const txHash = String(req.body.txHash || '').trim();
      const contentId = String(req.body.contentId || '').trim();
      if (!txHash) return res.status(400).json({ error: 'txHash is required' });

      const contractAddress = String(process.env.NIBGATE_REPUTATION_CONTRACT || DEFAULT_NIBGATE_REPUTATION_CONTRACT).toLowerCase();
      if (!contractAddress) return res.status(500).json({ error: 'NIBGATE_REPUTATION_CONTRACT is not configured' });

      const client = publicClientForIndexer();
      if (!client) return res.status(500).json({ error: 'NIBGATE_REPUTATION_RPC_URL is not configured' });

      let website = null;
      let content = null;

      if (contentId) {
        content = await db.content.findUnique({
          where: { id: contentId },
          include: { website: true, publisher: true }
        });
      } else {
        const siteId = String(req.body.siteId || req.body.site || '').trim();
        const token = String(req.body.token || '').trim();
        if (!siteId || !token) return res.status(400).json({ error: 'contentId or siteId/token/resource is required' });

        website = await db.website.findFirst({
          where: { id: siteId, verifyToken: token, deletedAt: null, isVerified: true, verificationStatus: 'verified' }
        });
        if (!website) return res.status(401).json({ error: 'Invalid tracking token' });

        const originHostname = extractOriginHostname(req, req.body);
        if (originHostname && !hostnameMatchesSite(originHostname, website.domain)) {
          return res.status(403).json({ error: 'Tracking origin does not match this site' });
        }

        content = await upsertTrackedContent(website, { ...req.body, event: 'content_registered' });
      }
      if (!content) return res.status(404).json({ error: 'Content not found' });
      if (!content.website) content = await db.content.findUnique({ where: { id: content.id }, include: { website: true, publisher: true } });

      const receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') return res.status(409).json({ error: 'Rating transaction did not succeed' });

      const expectedContentHash = contentHashFor(content.website, content);
      let matched = null;
      for (const log of receipt.logs || []) {
        if (String(log.address || '').toLowerCase() !== contractAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [CONTENT_RATED_EVENT],
            data: log.data,
            topics: log.topics
          });
          if (decoded.eventName !== 'ContentRated') continue;
          if (String(decoded.args.contentId).toLowerCase() !== expectedContentHash.toLowerCase()) continue;
          matched = decoded.args;
          break;
        } catch {
          // Ignore unrelated logs.
        }
      }

      if (!matched) return res.status(404).json({ error: 'No matching ContentRated event found for this content' });

      const walletAddress = String(matched.rater || '').toLowerCase();
      const unlock = await db.unlockReceipt.findFirst({
        where: {
          contentId: content.id,
          OR: [
            { payerWallet: walletAddress },
            ...(matched.proof ? [{ paymentId: String(matched.proof) }] : []),
            ...(matched.proof ? [{ txHash: String(matched.proof) }] : [])
          ]
        }
      });
      if (!unlock) return res.status(403).json({ error: 'Rating wallet has no unlock receipt for this content' });

      const ratingValue = Math.max(1, Math.min(50, Number(matched.rating || 0)));
      const rating = await db.contentRating.upsert({
        where: { contentId_walletAddress: { contentId: content.id, walletAddress } },
        update: {
          ratingValue,
          txHash,
          reviewHash: String(matched.reviewHash || ''),
          proofType: 'onchain',
          proof: String(matched.proof || ''),
          status: 'accepted',
          metadata: JSON.stringify({ txHash, log: matched }).slice(0, 12000)
        },
        create: {
          contentId: content.id,
          websiteId: content.websiteId,
          walletAddress,
          ratingValue,
          txHash,
          reviewHash: String(matched.reviewHash || ''),
          proofType: 'onchain',
          proof: String(matched.proof || ''),
          status: 'accepted',
          metadata: JSON.stringify({ txHash, log: matched }).slice(0, 12000)
        }
      });

      return res.json({
        success: true,
        rating: {
          id: rating.id,
          contentId: rating.contentId,
          walletAddress: rating.walletAddress,
          rating: rating.ratingValue / 10,
          txHash,
          proofType: rating.proofType,
          status: rating.status
        }
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to index onchain rating', details: error.message });
    }
  });

  app.get('/api/hub/dashboard/analytics', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true }
      });
      const websiteIds = websites.map((website) => website.id);
      const metricDateWhere = dateRangeWhere(req);

      if (websiteIds.length === 0) {
        return res.json({
          success: true,
          analytics: {
            totalViews: 0,
            pageViews: 0,
            resourceViews: 0,
            uniqueVisitors: 0,
            totalUnlocks: 0,
            unlockStarts: 0,
            payments: 0,
            unlockRate: 0,
            totalRevenue: 0,
            avgTimeSpentMs: 0,
            recentEvents: []
          }
        });
      }

      const [
        totalViews,
        pageViews,
        resourceViews,
        totalUnlocks,
        unlockStarts,
        payments,
        revenueAggregate,
        timeAggregate,
        uniqueVisitors,
        recentEvents,
        trackedContent
      ] = await Promise.all([
        db.metric.count({ where: { websiteId: { in: websiteIds }, type: 'view', ...metricDateWhere } }),
        db.metric.count({ where: { websiteId: { in: websiteIds }, eventName: 'page_view', ...metricDateWhere } }),
        db.metric.count({ where: { websiteId: { in: websiteIds }, eventName: 'resource_view', ...metricDateWhere } }),
        db.metric.count({ where: { websiteId: { in: websiteIds }, eventName: { in: ['resource_unlock', 'unlock_completed', 'unlock'] }, ...metricDateWhere } }),
        db.metric.count({ where: { websiteId: { in: websiteIds }, eventName: 'unlock_started', ...metricDateWhere } }),
        db.metric.count({ where: { websiteId: { in: websiteIds }, eventName: { in: ['payment_completed', 'payment_success'] }, ...metricDateWhere } }),
        db.metric.aggregate({
          where: { websiteId: { in: websiteIds }, type: { in: ['unlock', 'payment'] }, ...metricDateWhere },
          _sum: { revenue: true }
        }),
        db.metric.aggregate({
          where: { websiteId: { in: websiteIds }, eventName: 'time_spent', ...metricDateWhere },
          _avg: { durationMs: true }
        }),
        db.metric.findMany({
          where: { websiteId: { in: websiteIds }, visitorId: { not: null }, ...metricDateWhere },
          distinct: ['visitorId'],
          select: { visitorId: true }
        }),
        db.metric.findMany({
          where: { websiteId: { in: websiteIds }, ...metricDateWhere },
          include: {
            website: true,
            content: true
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        }),
        db.content.findMany({
          where: {
            website: { ownerId: req.user.id, deletedAt: null, isVerified: true }
          },
          include: {
            website: true,
            metrics: { where: metricDateWhere },
          ratings: true,
          unlockReceipts: true,
            _count: { select: { metrics: true, unlockReceipts: true, ratings: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        })
      ]);
      const contentMetrics = trackedContent.map(serializeContent);
      const contentMix = Array.from(contentMetrics.reduce((map, content) => {
        const type = normalizeContentType(content.contentType);
        map.set(type, (map.get(type) || 0) + 1);
        return map;
      }, new Map())).map(([label, value]) => ({ label, value }));

      res.json({
        success: true,
        analytics: {
          totalViews,
          pageViews,
          resourceViews,
          uniqueVisitors: uniqueVisitors.length,
          totalUnlocks,
          unlockStarts,
          payments,
          unlockRate: totalViews > 0 ? totalUnlocks / totalViews : 0,
          totalRevenue: revenueAggregate._sum.revenue || 0,
          avgTimeSpentMs: Math.round(timeAggregate._avg.durationMs || 0),
          topContent: contentMetrics
            .sort((a, b) => (b.revenue - a.revenue) || (b.unlocks - a.unlocks) || (b.views - a.views))
            .slice(0, 12)
            .map((content) => ({
              title: content.title,
              site: content.websiteName || content.websiteDomain,
              type: content.contentType,
              views: content.views,
              unlocks: content.unlocks,
              revenue: content.revenue,
              avgTimeMs: content.avgDurationMs,
              scrollDepth: 0
            })),
          contentMix,
          recentEvents: recentEvents.map((event) => ({
            id: event.id,
            type: event.type,
            eventName: event.eventName || event.type,
            revenue: event.revenue || 0,
            websiteName: event.website?.name || '',
            contentTitle: event.content?.title || '',
            path: event.path || '',
            durationMs: event.durationMs || 0,
            scrollDepth: event.scrollDepth || 0,
            createdAt: event.createdAt
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.get('/api/hub/dashboard/earnings', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true }
      });
      const websiteIds = websites.map((website) => website.id);
      const metricDateWhere = dateRangeWhere(req);

      if (websiteIds.length === 0) {
        return res.json({
          success: true,
          earnings: {
            availableBalance: 0,
            totalRevenue: 0,
            transactions: []
          }
        });
      }

      const [revenueAggregate, transactions, flowEvents, failedEvents] = await Promise.all([
        db.metric.aggregate({
          where: { websiteId: { in: websiteIds }, type: { in: ['unlock', 'payment'] }, ...metricDateWhere },
          _sum: { revenue: true }
        }),
        db.metric.findMany({
          where: { websiteId: { in: websiteIds }, type: { in: ['unlock', 'payment'] }, ...metricDateWhere },
          include: {
            website: true,
            content: true
          },
          orderBy: { createdAt: 'desc' },
          take: 25
        }),
        db.metric.groupBy({
          by: ['eventName'],
          where: { websiteId: { in: websiteIds }, ...metricDateWhere },
          _count: { _all: true }
        }),
        db.metric.findMany({
          where: { websiteId: { in: websiteIds }, eventName: { in: ['payment_failed', 'unlock_failed'] }, ...metricDateWhere },
          select: { metadata: true },
          take: 250
        })
      ]);

      const totalRevenue = revenueAggregate._sum.revenue || 0;
      const flowCount = (names) => flowEvents
        .filter((event) => names.includes(event.eventName || ''))
        .reduce((sum, event) => sum + event._count._all, 0);
      const failureReasons = Array.from(failedEvents.reduce((map, metric) => {
        const metadata = parseMetricMetadata(metric);
        const reason = metadata.reason || metadata.error || metadata.status || 'Failed';
        map.set(reason, (map.get(reason) || 0) + 1);
        return map;
      }, new Map())).map(([label, value]) => ({ label, value }));

      res.json({
        success: true,
        earnings: {
          availableBalance: totalRevenue,
          totalRevenue,
          flow: [
            { label: 'Payment challenges', value: flowCount(['payment_required', 'payment_challenge']), helper: '402 responses shown' },
            { label: 'Payment attempts', value: flowCount(['payment_started', 'payment_attempted', 'unlock_started']), helper: 'wallet/gateway started' },
            { label: 'Verified payments', value: flowCount(['payment_completed', 'payment_success']), helper: 'proof accepted' },
            { label: 'Unlocks issued', value: flowCount(['resource_unlock', 'unlock_completed', 'unlock']), helper: 'access granted' }
          ],
          failureReasons,
          transactions: transactions.map((transaction) => ({
            id: transaction.id,
            amount: transaction.revenue || 0,
            contentTitle: transaction.content?.title || '',
            websiteName: transaction.website?.name || '',
            createdAt: transaction.createdAt,
            ...paymentFieldsFromMetric(transaction)
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch earnings' });
    }
  });


  app.get('/api/hub/reputation/leaderboards', async (req, res) => {
    try {
      const type = String(req.query.type || 'creators').trim().toLowerCase();
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10) || 20, 1), 50);

      if (type === 'content') {
        const content = await db.content.findMany({
          where: { website: { isVerified: true, deletedAt: null } },
          include: { website: { include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } } }, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
          take: 200,
          orderBy: { createdAt: 'desc' }
        });
        const items = content.map(serializeContent)
          .sort((a, b) => (b.reputationScore - a.reputationScore) || (b.unlocks - a.unlocks) || (b.views - a.views))
          .slice(0, limit)
          .map((content, index) => ({ rank: index + 1, ...content }));
        return res.json({ success: true, type: 'content', items });
      }

      if (type === 'sites') {
        const websites = await db.website.findMany({
          where: { deletedAt: null, isVerified: true },
          include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } }, content: { include: { website: true, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } }, _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } },
          take: 200,
          orderBy: { createdAt: 'desc' }
        });
        const items = websites.map((website) => {
          const content = website.content.map(serializeContent);
          const score = siteReputationScore(content, website);
          const views = content.reduce((sum, item) => sum + item.views, 0);
          const unlocks = content.reduce((sum, item) => sum + item.unlocks, 0);
          const revenue = content.reduce((sum, item) => sum + item.revenue, 0);
          return {
            id: website.id,
            name: website.name,
            domain: website.domain,
            description: website.description || '',
            faviconUrl: website.faviconUrl || '',
            ownerName: website.owner?.username || '',
            ownerWallet: primaryWalletAddress(website.owner || {}),
            reputationScore: score,
            contentCount: content.length,
            views,
            unlocks,
            revenue,
            verificationStatus: website.verificationStatus || '',
            lastVerifiedAt: website.lastVerifiedAt || null
          };
        }).sort((a, b) => (b.reputationScore - a.reputationScore) || (b.unlocks - a.unlocks) || (b.views - a.views)).slice(0, limit).map((site, index) => ({ rank: index + 1, ...site }));
        return res.json({ success: true, type: 'sites', items });
      }

      const users = await db.user.findMany({
        include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }, websites: { where: { deletedAt: null }, include: { content: { include: { website: true, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } } } } },
        take: 200,
        orderBy: { createdAt: 'asc' }
      });
      const items = users.map((user) => {
        const websites = user.websites || [];
        const content = websites.flatMap((website) => website.content.map(serializeContent));
        const score = creatorReputationScore(content, websites);
        const views = content.reduce((sum, item) => sum + item.views, 0);
        const unlocks = content.reduce((sum, item) => sum + item.unlocks, 0);
        const revenue = content.reduce((sum, item) => sum + item.revenue, 0);
        return {
          id: user.id,
          name: user.username || 'Unnamed creator',
          walletAddress: primaryWalletAddress(user),
          avatarUrl: user.avatarUrl || '',
          bio: user.bio || '',
          reputationScore: score,
          verifiedSites: websites.filter((website) => website.isVerified && website.verificationStatus === 'verified').length,
          siteCount: websites.length,
          contentCount: content.length,
          views,
          unlocks,
          revenue
        };
      }).filter((creator) => creator.contentCount > 0 || creator.verifiedSites > 0)
        .sort((a, b) => (b.reputationScore - a.reputationScore) || (b.unlocks - a.unlocks) || (b.views - a.views))
        .slice(0, limit)
        .map((creator, index) => ({ rank: index + 1, ...creator }));
      return res.json({ success: true, type: 'creators', items });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch reputation leaderboards', details: error.message });
    }
  });

  app.get('/api/hub/explore/content', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const type = normalizeContentType(req.query.type || '');
      const requestedType = String(req.query.type || '').trim().toLowerCase();
      const sort = String(req.query.sort || 'trending').trim().toLowerCase();
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '60', 10) || 60, 1), 100);
      const content = await db.content.findMany({
        where: {
          website: { isVerified: true, deletedAt: null },
          ...(requestedType && requestedType !== 'all' ? { contentType: type } : {}),
          ...(q ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { tags: { contains: q } },
              { website: { name: { contains: q } } },
              { website: { domain: { contains: q } } }
            ]
          } : {})
        },
        include: {
          website: true,
          metrics: true,
          ratings: true,
          unlockReceipts: true,
          _count: { select: { metrics: true, unlockReceipts: true, ratings: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
      const serialized = content.map(serializeContent);
      const sorted = serialized.sort((a, b) => {
        if (sort === 'best-sellers') return (b.unlocks - a.unlocks) || (b.revenue - a.revenue) || (b.views - a.views);
        if (sort === 'hot-new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return (b.views + b.unlocks * 4 + b.revenue * 20) - (a.views + a.unlocks * 4 + a.revenue * 20);
      });

      res.json({
        success: true,
        content: sorted
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch explore content' });
    }
  });

}
