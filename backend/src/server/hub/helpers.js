import { db } from '@nibgate/internal/db.js';
import crypto from 'node:crypto';
import { keccak256, stringToBytes } from 'viem';

export function cleanDomain(domain = '') {
  return String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

export function isValidDomain(domain = '') {
  return /^localhost(:\d+)?$|^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain);
}

export function originFor(domain) {
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${domain}`;
}

export function manifestCandidateUrls(website) {
  const origin = originFor(website.domain).replace(/\/+$/, '');
  return [
    `${origin}/nibgate.json`,
    `${origin}/.well-known/nibgate.json`,
    `${origin}/v1/nibgate/manifest`,
    `${origin}/v1/nibgate/nibgate.json`
  ];
}

export function trackingScriptFor(website) {
  const widgetUrl = process.env.NIBGATE_WIDGET_URL || 'https://www.nibgate.xyz/widget.js';
  const apiUrl = process.env.NIBGATE_PUBLIC_API_URL || process.env.PUBLIC_API_URL || 'https://api.nibgate.xyz';
  return `<script async src="${widgetUrl}" data-nibgate-site="${website.id}" data-nibgate-token="${website.verifyToken}" data-nibgate-api="${apiUrl.replace(/\/+$/, '')}"></script>`;
}

export function serializeWebsite(website) {
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
    lastScanAt: website.lastScanAt || null,
    lastScanStatus: website.lastScanStatus || '',
    lastScanError: website.lastScanError || '',
    lastSyncAt: website.lastSyncAt || null,
    createdAt: website.createdAt,
    _count: {
      content: website._count?.content || 0,
      metrics: website._count?.metrics || 0
    }
  };
}

export function serializePublisherIdentity(publisher) {
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

export function hostnameMatchesSite(hostname = '', domain = '') {
  const cleanHost = cleanDomain(hostname);
  const cleanSite = cleanDomain(domain);
  return cleanHost === cleanSite || cleanHost === `www.${cleanSite}` || cleanHost.replace(/^www\./, '') === cleanSite;
}

export function eventTypeFor(input = '') {
  const event = String(input || '').trim().toLowerCase();
  if (['resource_unlock', 'unlock', 'unlock_started', 'unlock_completed'].includes(event)) return 'unlock';
  if (['payment_completed', 'payment_success', 'payment_failed'].includes(event)) return 'payment';
  if (['content_rating', 'rating_submitted', 'rating_completed'].includes(event)) return 'rating';
  if (['time_spent', 'heartbeat'].includes(event)) return 'time';
  if (['content_registered'].includes(event)) return 'content';
  if (['engagement', 'cta_click', 'scroll_depth', 'download', 'play', 'copy'].includes(event)) return 'engagement';
  return 'view';
}

export function cleanEventName(input = '') {
  return String(input || 'page_view').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_').slice(0, 80) || 'page_view';
}

export function numberOrNull(value) {
  const next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : null;
}

export function intOrNull(value) {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) ? next : null;
}

export function cleanIp(value = '') {
  return String(value || '').split(',')[0].trim().replace(/^::ffff:/, '');
}

export function clientIpFor(req) {
  return cleanIp(
    req.headers?.['cf-connecting-ip'] ||
    req.headers?.['x-real-ip'] ||
    req.headers?.['x-forwarded-for'] ||
    req.ip ||
    req.socket?.remoteAddress ||
    (typeof req === 'object' && req !== null ? String(req.ip || req.connection?.remoteAddress || '') : '') ||
    ''
  );
}

export function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function hashValue(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function trackingVisitorHash(req, website) {
  const salt = process.env.METRIC_HASH_SALT || process.env.SESSION_SECRET || process.env.NIBGATE_INDEXER_SECRET || 'nibgate-metric-salt';
  const ip = clientIpFor(req);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const acceptLanguage = String(req.headers['accept-language'] || '').slice(0, 120);
  return hashValue([salt, dayStamp(), website.id, cleanDomain(website.domain), ip, userAgent, acceptLanguage].join('|'));
}

// ── Rate limiting ──────────────────────────────────────────────────────────

export const trackingRateBuckets = new Map();

export function rateLimitKey(siteId, req, visitorHash = '') {
  return `${siteId}:${clientIpFor(req) || 'unknown'}:${visitorHash.slice(0, 16)}`;
}

export function checkTrackingRateLimit(siteId, req, visitorHash = '') {
  const now = Date.now();
  const windowMs = Number.parseInt(process.env.TRACKING_RATE_LIMIT_WINDOW_MS || '60000', 10);
  const maxHits = Number.parseInt(process.env.TRACKING_RATE_LIMIT_MAX || '180', 10);
  const key = rateLimitKey(siteId, req, visitorHash);
  const bucket = trackingRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    trackingRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count > maxHits) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  if (trackingRateBuckets.size > 5000 && Math.random() < 0.01) {
    for (const [bucketKey, value] of trackingRateBuckets) {
      if (value.resetAt <= now) trackingRateBuckets.delete(bucketKey);
    }
    db.metricDedupe.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }).catch(() => {});
  }

  return { ok: true };
}

// ── Metric deduplication ──────────────────────────────────────────────────

export function metricBucketMs(eventName = '', metricType = '') {
  if (metricType === 'view') return Number.parseInt(process.env.TRACKING_VIEW_DEDUPE_WINDOW_MS || String(30 * 60 * 1000), 10);
  if (metricType === 'content') return Number.parseInt(process.env.TRACKING_CONTENT_DEDUPE_WINDOW_MS || String(24 * 60 * 60 * 1000), 10);
  if (metricType === 'time') return Number.parseInt(process.env.TRACKING_TIME_DEDUPE_WINDOW_MS || String(5 * 60 * 1000), 10);
  if (['engagement'].includes(metricType)) return Number.parseInt(process.env.TRACKING_ENGAGEMENT_DEDUPE_WINDOW_MS || String(30 * 1000), 10);
  if (['unlock', 'payment'].includes(metricType)) return Number.parseInt(process.env.TRACKING_PAYMENT_DEDUPE_WINDOW_MS || String(24 * 60 * 60 * 1000), 10);
  return 0;
}

export function paymentLikeId(payload = {}) {
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : {};
  return String(payload.paymentId || payload.txHash || payload.transactionHash || payload.receiptUrl || payment.id || payment.paymentId || payment.txHash || payment.transactionHash || payment.receiptUrl || '').trim();
}

export function metricIdentity({ website, content, payload, eventName, metricType, visitorHash, bucketStart }) {
  if (['unlock', 'payment'].includes(metricType)) {
    const paymentId = paymentLikeId(payload);
    if (!paymentId) return '';
    return `pay:${website.id}:${eventName}:${content?.id || payload.path || payload.url || ''}:${hashValue(paymentId).slice(0, 32)}`;
  }

  const route = content?.id || payload.resource?.id || payload.path || payload.url || '';
  if (!route || !visitorHash || !bucketStart) return '';
  return [
    'metric',
    website.id,
    eventName,
    metricType,
    route,
    visitorHash,
    bucketStart.toISOString()
  ].join(':');
}

export async function claimMetricDedupeKey(dedupeKey = '') {
  if (!dedupeKey) return true;
  try {
    await db.metricDedupe.create({ data: { key: dedupeKey } });
    return true;
  } catch (error) {
    if (error?.code === 'P2002') return false;
    return true;
  }
}

export function dedupeBucketStart(eventName, metricType, now = Date.now()) {
  const windowMs = metricBucketMs(eventName, metricType);
  if (!windowMs) return null;
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export function dateRangeWhere(req) {
  const createdAt = {};
  const from = new Date(String(req.query?.from || ''));
  const to = new Date(String(req.query?.to || ''));
  if (!Number.isNaN(from.getTime())) createdAt.gte = from;
  if (!Number.isNaN(to.getTime())) createdAt.lte = to;
  return Object.keys(createdAt).length ? { createdAt } : {};
}

// ── Content and publisher helpers ─────────────────────────────────────────

const ALLOWED_CONTENT_TYPES = new Set(['music', 'video', 'article', 'image']);

export function normalizeContentType(value = '') {
  const type = String(value || '').trim().toLowerCase();
  if (ALLOWED_CONTENT_TYPES.has(type)) return type;
  if (['audio', 'song', 'track', 'album', 'playlist'].includes(type)) return 'music';
  if (['photo', 'picture', 'illustration', 'art'].includes(type)) return 'image';
  if (['movie', 'clip'].includes(type)) return 'video';
  return 'article';
}

export function absoluteResourceUrl(website, resource = {}, fallbackUrl = '') {
  const value = String(resource.url || resource.path || fallbackUrl || '').trim();
  if (!value) return `${originFor(website.domain)}/`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${originFor(website.domain)}${value.startsWith('/') ? value : `/${value}`}`;
}

export function cleanTags(value) {
  const tags = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return tags
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 12);
}

export function cleanPublisherHandle(value = '') {
  return String(value || '').trim().replace(/^@+/, '').slice(0, 120);
}

export function normalizeWallet(value = '') {
  return String(value || '').trim().toLowerCase() || null;
}

export function publisherPayloadFor(payload = {}) {
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

export async function upsertPublisherIdentity(website, payload = {}) {
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

export function publisherContentFields(publisher) {
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

export function contentDataFor(website, payload = {}, publisher = null) {
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
  const imgUrl = resource.imageUrl || resource.image || payload.imageUrl || null;
  return {
    externalId,
    title,
    description: resource.description || payload.description || null,
    ...(imgUrl ? { imageUrl: imgUrl } : {}),
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

export async function upsertTrackedContent(website, payload = {}) {
  const resource = payload.resource || {};
  const hasResourceSignal = resource.id || resource.url || resource.path || resource.title || payload.event === 'content_registered' || payload.event === 'resource_view' || payload.event === 'resource_unlock';
  if (!hasResourceSignal) return null;

  const publisher = await upsertPublisherIdentity(website, payload);
  const data = contentDataFor(website, payload, publisher);
  const idSeed = data.externalId || data.url;
  const contentId = crypto.createHash('md5').update(website.id + idSeed).digest('hex');

  return db.content.upsert({
    where: { id: contentId },
    update: { ...data, deletedAt: null },
    create: {
      id: contentId,
      websiteId: website.id,
      ...data
    },
    include: { publisher: true }
  });
}

export function resourcesFromManifest(manifest = {}) {
  if (Array.isArray(manifest.content)) return manifest.content;
  if (Array.isArray(manifest.resources)) return manifest.resources;
  if (Array.isArray(manifest.nibgate?.content)) return manifest.nibgate.content;
  if (Array.isArray(manifest.nibgate?.resources)) return manifest.nibgate.resources;
  return [];
}

export function paymentPayload(payload = {}) {
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : {};
  return { ...payload, ...payment };
}

export function walletFromPayload(payload = {}) {
  const input = paymentPayload(payload);
  return String(input.walletAddress || input.payer || input.buyer || input.account || input.address || '').trim().toLowerCase();
}

export function paymentIdFromPayload(payload = {}, contentId = '') {
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

export async function upsertUnlockReceipt(website, content, payload = {}, eventName = '') {
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
      amount: Number.parseFloat(input.amount || input.revenue || payload.revenue || input.price || payload.price || input.value || payload.value || '0') || null,
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
      amount: Number.parseFloat(input.amount || input.revenue || payload.revenue || input.price || payload.price || input.value || payload.value || '0') || null,
      currency: input.currency || payload.currency || content.currency || null,
      recipientWallet: input.recipient || input.payTo || content.recipientWallet || null,
      status: input.status || 'verified',
      metadata: JSON.stringify(payload).slice(0, 12000)
    }
  });
}

// ── Rating helpers ─────────────────────────────────────────────────────────

export function ratingValueFromPayload(payload = {}) {
  const input = paymentPayload(payload);
  const raw = input.ratingValue ?? input.rating ?? input.stars ?? input.score;
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return null;
  const value = numeric <= 5 ? Math.round(numeric * 10) : Math.round(numeric);
  return Math.max(1, Math.min(50, value));
}

export function ratingMessageFor(website, content, ratingValue) {
  return [
    'Nibgate content rating',
    `site:${website.domain}`,
    `content:${content.externalId || content.id}`,
    `url:${content.url}`,
    `rating:${ratingValue}`,
    'I confirm this rating is tied to my unlock/payment proof.'
  ].join('\n');
}

export const CONTENT_RATED_EVENT = {
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

export function contentHashFor(website, content) {
  return keccak256(stringToBytes([
    CONTENT_HASH_NAMESPACE,
    cleanDomain(website.domain),
    content.externalId || content.id,
    content.url
  ].join('|')));
}

export async function verifySignedRating(website, content, payload = {}, walletAddress = '', ratingValue = 0) {
  const input = paymentPayload(payload);
  const signature = input.signature || input.ratingSignature || '';
  const suppliedMessage = input.message || input.ratingMessage || '';
  if (!signature) return { ok: false, status: 'missing_signature', proofType: input.txHash ? 'onchain_pending' : 'signed' };

  const expectedMessage = ratingMessageFor(website, content, ratingValue);
  if (suppliedMessage && suppliedMessage !== expectedMessage) {
    return { ok: false, status: 'message_mismatch', proofType: 'signed' };
  }

  try {
    const { verifyMessage } = await import('viem');
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

export async function upsertContentRating(website, content, payload = {}, eventName = '') {
  if (!content || !['content_rating', 'rating_submitted', 'rating_completed'].includes(eventName)) return null;
  const walletAddress = walletFromPayload(payload);
  const ratingValue = ratingValueFromPayload(payload);
  if (!walletAddress || !ratingValue) return null;

  const proof = paymentPayload(payload);
  const hasUnlock = await db.unlockReceipt.findFirst({
    where: { contentId: content.id, OR: [{ payerWallet: walletAddress }, { txHash: proof.txHash || '' }, { paymentId: proof.paymentId || '' }] }
  });
  if (!hasUnlock && !proof.txHash && !proof.paymentId) return null;

  let ratingProof = null;
  if (proof.txHash) {
    ratingProof = `onchain:${proof.txHash}`;
  } else if (proof.paymentId || hasUnlock) {
    const verified = await verifySignedRating(website, content, payload, walletAddress, ratingValue);
    if (verified.ok) {
      ratingProof = verified.proof ? `signed:${verified.proof.slice(0, 40)}` : `receipt:${hasUnlock?.paymentId || proof.paymentId || ''}`;
    } else {
      if (verified.status === 'missing_signature') return null;
      ratingProof = `receipt:${hasUnlock?.paymentId || proof.paymentId || ''}`;
    }
  }

  return db.contentRating.upsert({
    where: { contentId_walletAddress: { contentId: content.id, walletAddress } },
    update: { ratingValue, proof: ratingProof, updatedAt: new Date() },
    create: { contentId: content.id, websiteId: website.id, walletAddress, ratingValue, proof: ratingProof }
  });
}

export async function upsertOnchainRatingForContent(content, args, txHash) {
  if (!content || !args) return { ok: false, reason: 'missing_data' };
  const walletAddress = String(args.rater || '').toLowerCase();
  const ratingValue = typeof args.rating === 'bigint' ? Number(args.rating) : Number(args.rating || 0);
  if (!walletAddress || !ratingValue) return { ok: false, reason: 'invalid_args' };

  const contentHash = String(args.contentId || '');
  const indexedContent = await db.content.findFirst({
    where: {
      website: { isVerified: true, deletedAt: null },
      OR: [
        { id: contentHash },
        { externalId: contentHash }
      ]
    }
  });
  if (!indexedContent) return { ok: false, reason: 'content_not_found' };

  const unlock = await db.unlockReceipt.findFirst({
    where: {
      contentId: indexedContent.id,
      OR: [
        { payerWallet: walletAddress },
        ...(args.proof ? [{ paymentId: String(args.proof) }] : []),
        ...(args.proof ? [{ txHash: String(args.proof) }] : [])
      ]
    }
  });
  if (!unlock && !content.allowUnverifiedRating) return { ok: false, reason: 'no_unlock_receipt' };

  await db.contentRating.upsert({
    where: { contentId_walletAddress: { contentId: indexedContent.id, walletAddress } },
    update: { ratingValue, proof: txHash ? `onchain:${txHash}` : null, updatedAt: new Date() },
    create: { contentId: indexedContent.id, websiteId: indexedContent.websiteId, walletAddress, ratingValue, proof: txHash ? `onchain:${txHash}` : null }
  });

  return { ok: true, contentId: indexedContent.id, walletAddress, ratingValue };
}

export async function createMetric(website, content, payload = {}, eventName = '', metricType = '') {
  const visitorHash = trackingVisitorHash({ headers: payload.headers || {}, ip: payload.ip }, website);
  const bucketStart = dedupeBucketStart(eventName, metricType);
  const dedupeKey = metricIdentity({ website, content, payload, eventName, metricType, visitorHash, bucketStart });
  const shouldCreate = await claimMetricDedupeKey(dedupeKey);

  if (!shouldCreate) return null;

  const revenue = numberOrNull(payload.revenue || payload.amount || payload.value || payload.price);

  let metadata;
  try {
    metadata = JSON.stringify(payload).slice(0, 5000);
  } catch {
    metadata = JSON.stringify({ error: 'non-serializable payload', eventName, metricType }).slice(0, 5000);
  }

  return db.metric.create({
    data: {
      websiteId: website.id,
      contentId: content?.id || null,
      publisherId: content?.publisherId || null,
      visitorId: visitorHash,
      eventName,
      type: metricType,
      revenue,
      durationMs: intOrNull(payload.durationMs || payload.duration),
      metadata,
      dedupeKey: dedupeKey || null
    }
  });
}

// ── Website verification ───────────────────────────────────────────────────

export async function fetchHomeHtml(domain) {
  const url = originFor(domain);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function htmlContainsTrackingScript(html, website) {
  const escapedId = website.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`data-nibgate-site\\s*=\\s*["']${escapedId}["']`).test(html || '');
}

export async function checkWebsiteVerification(website) {
  const checkedAt = new Date();
  const homeUrl = originFor(website.domain);
  const data = { lastVerificationCheckAt: checkedAt };

  try {
    const html = await fetchHomeHtml(website.domain);
    if (!htmlContainsTrackingScript(html, website)) {
      return {
        ok: false, status: 'missing_widget',
        reason: 'Nibgate widget was not found on the site homepage.',
        data: { ...data, isVerified: false, verificationStatus: 'missing_widget', verificationFailureReason: 'Nibgate widget was not found on the site homepage.' }
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
      ok: true, status: 'verified', reason: '',
      data: { ...data, isVerified: true, verificationStatus: 'verified', lastVerifiedAt: checkedAt, verificationFailureReason: null, faviconUrl: `https://www.google.com/s2/favicons?domain=${website.domain}&sz=128`, ogImageUrl, description }
    };
  } catch (error) {
    return {
      ok: false, status: 'failed',
      reason: 'Could not fetch the site homepage to verify the Nibgate widget.',
      data: { ...data, isVerified: false, verificationStatus: 'failed', verificationFailureReason: 'Could not fetch the site homepage to verify the Nibgate widget.' }
    };
  }
}

// ── Manifest sync ──────────────────────────────────────────────────────────

export async function syncWebsiteManifest(website) {
  const urls = manifestCandidateUrls(website);
  let lastError = '';

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.parseInt(process.env.MANIFEST_SYNC_FETCH_TIMEOUT_MS || '5000', 10));
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) { lastError = `${url} returned ${response.status}`; continue; }

      const manifest = await response.json();
      const resources = resourcesFromManifest(manifest);
      if (!resources.length) { lastError = `${url} had no content`; continue; }

      const upserted = [];
      for (const resource of resources) {
        const content = await upsertTrackedContent(website, { event: 'content_registered', resource, url: resource.url, path: resource.path || resource.route });
        if (content) upserted.push(content);
      }

      const upsertedIds = upserted.map((c) => c.id).filter(Boolean);
      if (upsertedIds.length) {
        await db.content.updateMany({
          where: { websiteId: website.id, externalId: { not: null }, deletedAt: null, id: { notIn: upsertedIds } },
          data: { deletedAt: new Date() }
        }).catch(() => {});
      }

      await db.website.update({
        where: { id: website.id },
        data: { lastScanAt: new Date(), lastSyncAt: new Date(), lastScanStatus: 'synced', lastScanError: null }
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
    data: { lastScanAt: new Date(), lastScanStatus: 'failed', lastScanError: lastError || 'No Nibgate manifest found.' }
  }).catch(() => {});

  return { ok: false, error: lastError || 'No Nibgate manifest found.' };
}

// ── Reputation helpers ────────────────────────────────────────────────────

export function ratingAverage(ratings = []) {
  const accepted = ratings.filter((r) => r.proof || r.ratingValue);
  if (!accepted.length) return null;
  const avg = accepted.reduce((sum, r) => sum + (r.ratingValue || 0), 0) / accepted.length;
  return Math.round((avg / 10) * 10) / 10;
}

export function acceptedRatingCount(ratings = []) {
  return ratings.filter((r) => r.proof || r.ratingValue).length;
}

export function primaryWalletAddress(user = {}) {
  const wallets = Array.isArray(user.wallets) ? user.wallets : [];
  return wallets.find((w) => w.isPrimary)?.address || wallets[0]?.address || '';
}

export function siteReputationScore(contents = [], website = {}) {
  const contentScores = contents.map((content) => content.reputationScore || 0).filter(Boolean);
  const ratingCount = contents.reduce((sum, content) => sum + (content.ratings || 0), 0);
  if (!ratingCount) return null;
  const avgContent = average(contentScores);
  const verification = website.isVerified && website.verificationStatus === 'verified' ? 12 : 0;
  const depth = Math.min(10, contentScores.length * 2);
  const score = avgContent ? avgContent * 0.78 + verification + depth : verification + depth;
  return Math.max(1, Math.min(100, Math.round(score || 1)));
}

export function creatorReputationScore(contents = [], websites = []) {
  const contentScores = contents.map((content) => content.reputationScore || 0).filter(Boolean);
  const ratingCount = contents.reduce((sum, content) => sum + (content.ratings || 0), 0);
  if (!ratingCount) return null;
  const avgContent = average(contentScores);
  const verifiedSites = websites.filter((website) => website.isVerified && website.verificationStatus === 'verified').length;
  const siteDepth = Math.min(12, verifiedSites * 4);
  const contentDepth = Math.min(12, contentScores.length * 1.5);
  const score = avgContent ? avgContent * 0.76 + siteDepth + contentDepth : siteDepth + contentDepth;
  return Math.max(1, Math.min(100, Math.round(score || 1)));
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ── Content serialization ─────────────────────────────────────────────────

export function serializeContent(content) {
  const metrics = Array.isArray(content.metrics) ? content.metrics : [];
  const ratings = Array.isArray(content.ratings) ? content.ratings : [];
  const unlockReceipts = Array.isArray(content.unlockReceipts) ? content.unlockReceipts : [];
  const hasOnchainProof = unlockReceipts.some((r) => r.txHash && r.txHash.length > 10);
  const views = metrics.filter((metric) => metric.type === 'view').length;
  const unlocks = metrics.filter((metric) => metric.type === 'unlock' && metric.eventName === 'unlock_completed').length;
  const revenueMetrics = metrics.filter((m) => m.eventName === 'unlock_completed');
  let revenue = 0;
  if (hasOnchainProof) {
    revenue = revenueMetrics.reduce((total, metric) => total + (metric.revenue || 0), 0);
  } else {
    const smallRevenueMetrics = revenueMetrics.filter((m) => m.revenue < 100);
    revenue = smallRevenueMetrics.reduce((total, m) => total + (m.revenue || 0), 0);
  }
  const timeEvents = metrics.filter((metric) => metric.durationMs);
  const avgDurationMs = timeEvents.length
    ? Math.round(timeEvents.reduce((total, metric) => total + (metric.durationMs || 0), 0) / timeEvents.length)
    : 0;

  const explicitStars = ratingAverage(ratings);
  const reputationStars = explicitStars || null;
  const reputationScore = explicitStars ? Math.round(explicitStars * 20) : null;
  const ratingCount = acceptedRatingCount(ratings);

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
    deletedAt: content.deletedAt || null,
    createdAt: content.createdAt,
    metrics: content._count?.metrics || metrics.length || 0,
    views,
    unlocks,
    revenue,
    avgDurationMs,
    receipts: content._count?.unlockReceipts || unlockReceipts.length || 0,
    ratings: ratingCount,
    reputationScore,
    reputationStars
  };
}

export function findContentByHash(contentHash) {
  return db.content.findFirst({
    where: {
      website: { isVerified: true, deletedAt: null },
      OR: [
        { id: contentHash },
        { externalId: contentHash }
      ]
    },
    include: {
      website: true,
      publisher: true
    }
  });
}
