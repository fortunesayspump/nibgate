import { normalizePaymentRail } from './payment.js';
export const CONTENT_TYPES = ['music', 'video', 'article', 'image', 'document'];
export const TYPE_ALIASES = {
  audio: 'music',
  song: 'music',
  track: 'music',
  album: 'music',
  playlist: 'music',
  photo: 'image',
  picture: 'image',
  illustration: 'image',
  art: 'image',
  movie: 'video',
  clip: 'video',
  doc: 'document',
  docs: 'document',
  file: 'document',
  pdf: 'document',
  sheet: 'document',
  spreadsheet: 'document',
  worksheet: 'document'
};
export const ACCESS_MODES = ['free', 'paid', 'blocked'];
export const UNLOCK_MODES = ['one_time', 'metered_stream', 'metered_read', 'time_pass', 'agent_quota'];

export function normalizeContentType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (CONTENT_TYPES.includes(type)) return type;
  return TYPE_ALIASES[type] || 'article';
}

export function normalizeAccessMode(value, fallback = 'paid') {
  const mode = String(value || '').trim().toLowerCase();
  return ACCESS_MODES.includes(mode) ? mode : fallback;
}

export function normalizeAccessPolicy(value = {}) {
  if (typeof value === 'string') {
    const mode = normalizeAccessMode(value);
    return { humans: mode, agents: mode };
  }

  return {
    humans: normalizeAccessMode(value.humans || value.human || value.default, 'paid'),
    agents: normalizeAccessMode(value.agents || value.agent || value.default, 'paid')
  };
}

export function normalizeUnlockPolicy(value = {}) {
  const input = typeof value === 'string' ? { mode: value } : (value || {});
  const mode = String(input.mode || input.type || 'one_time').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return {
    ...input,
    mode: UNLOCK_MODES.includes(mode) ? mode : 'one_time'
  };
}

function browserEnv() {
  return typeof window !== 'undefined' ? window : null;
}

function metaContent(name) {
  const win = browserEnv();
  if (!win) return '';
  const selector = `meta[name="${name}"], meta[property="${name}"]`;
  const node = win.document.querySelector(selector);
  return node ? node.getAttribute('content') || '' : '';
}

function autoDeriveUrl(path) {
  const win = browserEnv();
  if (!win || !path) return undefined;
  return `${win.location.origin}${path.startsWith('/') ? path : '/' + path}`;
}

function autoDeriveImage() {
  return metaContent('og:image') || undefined;
}

function autoDeriveDescription() {
  return metaContent('og:description') || metaContent('description') || undefined;
}

function autoDeriveTitle() {
  const win = browserEnv();
  return metaContent('og:title') || metaContent('twitter:title') || (win ? win.document.title : '') || undefined;
}

function autoDeriveType() {
  const ogType = metaContent('og:type').toLowerCase();
  if (ogType.includes('music') || ogType.includes('audio') || ogType.includes('song')) return 'music';
  if (ogType.includes('video') || ogType.includes('movie')) return 'video';
  if (ogType.includes('image') || ogType.includes('photo')) return 'image';
  if (ogType.includes('document') || ogType.includes('pdf') || ogType.includes('paper')) return 'document';
  return 'article';
}

function autoDeriveTags() {
  const kw = metaContent('keywords');
  if (!kw) return undefined;
  return kw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
}

function accessForPrice(price, explicitAccess) {
  if (explicitAccess && typeof explicitAccess === 'object' && Object.keys(explicitAccess).length > 0) {
    return normalizeAccessPolicy(explicitAccess);
  }
  const hasPrice = price !== undefined && price !== null && price !== '' && Number.parseFloat(price) > 0;
  if (hasPrice) return { humans: 'paid', agents: 'paid' };
  return { humans: 'free', agents: 'free' };
}

export function normalizeResource(resource = {}) {
  const input = typeof resource === 'string' ? { id: resource } : (resource || {});
  const {
    publisher,
    publisherId,
    publisherWallet,
    publisherHandle,
    publisherName,
    publisherProfileUrl,
    publisherOrigin,
    publisherVerification,
    authorHandle,
    ...v1Input
  } = input;

  const path = input.path || input.route || undefined;
  const url = input.url || autoDeriveUrl(path) || undefined;
  const explicitAccess = input.access;
  const price = input.price ?? input.amount ?? '';

  return {
    ...v1Input,
    id: String(input.id || input.contentId || input.slug || '').trim(),
    title: String(input.title || input.name || autoDeriveTitle() || 'Untitled').trim(),
    type: normalizeContentType(input.type || input.contentType || autoDeriveType()),
    price,
    currency: input.currency || 'USDC',
    paymentRail: normalizePaymentRail(input.paymentRail || input.paymentMode || input.rail),
    recipient: input.recipient || input.receiver || input.receiverAddress || input.payTo || input.creatorWallet || undefined,
    payTo: input.payTo || input.recipient || input.receiver || input.receiverAddress || input.creatorWallet || undefined,
    path,
    url,
    imageUrl: input.imageUrl || input.image || autoDeriveImage() || undefined,
    description: input.description || input.summary || autoDeriveDescription() || undefined,
    tags: input.tags || autoDeriveTags() || undefined,
    access: accessForPrice(price, explicitAccess),
    unlock: normalizeUnlockPolicy(input.unlock),
    ratingsEnabled: input.ratingsEnabled ?? input.enableRatings ?? input.reputation?.ratingsEnabled ?? true,
    reputation: {
      ...(typeof input.reputation === 'object' && input.reputation ? input.reputation : {}),
      ratingsEnabled: input.ratingsEnabled ?? input.enableRatings ?? input.reputation?.ratingsEnabled ?? true
    }
  };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isPaidResource(resource = {}) {
  const access = normalizeAccessPolicy(resource.access);
  return access.humans === 'paid' || access.agents === 'paid' || Number.parseFloat(resource.price || resource.amount || '0') > 0;
}

export function validateResourceMetadata(resource = {}, options = {}) {
  const normalized = normalizeResource(resource);
  const warnings = [];
  const errors = [];
  const required = options.required || ['id', 'type'];
  const recommended = options.recommended || ['title', 'url', 'description', 'imageUrl', 'tags'];

  for (const field of required) {
    if (!hasValue(normalized[field])) errors.push(`Missing required content metadata: ${field}`);
  }

  for (const field of recommended) {
    if (!hasValue(normalized[field])) warnings.push(`Missing recommended discovery metadata: ${field}`);
  }

  if (!CONTENT_TYPES.includes(normalized.type)) errors.push('Content type must be one of music, video, article, image, or document.');

  if (normalized.url && !/^https?:\/\//i.test(String(normalized.url))) {
    warnings.push('Use an absolute canonical url for stronger discovery identity.');
  }

  if (normalized.imageUrl && !/^https?:\/\//i.test(String(normalized.imageUrl))) {
    warnings.push('Use an absolute imageUrl for thumbnails in Explore and agent discovery.');
  }

  if (isPaidResource(normalized)) {
    if (!hasValue(normalized.price)) errors.push('Paid content requires price.');
  }

  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 8);
  return {
    ok: errors.length === 0,
    score,
    errors,
    warnings,
    resource: normalized
  };
}

export function normalizeServerResource(resource = {}) {
  const normalized = normalizeResource(resource);
  return {
    ...normalized,
    title: normalized.title || String((typeof resource === 'object' && (resource.name || resource.id)) || 'Untitled content').trim(),
    price: normalized.price || '0',
    path: normalized.path || '/',
  };
}
