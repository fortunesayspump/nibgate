// Public feeds never read NibShare tables. A paid private share is still private.
// Content currently has no explicit listing-consent field: these predicates
// cover verified indexed metadata, not a new guarantee of creator opt-in.
export function publicSiteWhere(domain) {
  return { deletedAt: null, isVerified: true, verificationStatus: 'verified', ...(domain ? { domain } : {}) };
}

const privateLocationFilters = (urlField) => [
  { [urlField]: { startsWith: '/ns/', mode: 'insensitive' } },
  { [urlField]: { startsWith: '/share/', mode: 'insensitive' } },
  { [urlField]: { startsWith: '/nibshare/', mode: 'insensitive' } },
  { [urlField]: { contains: '/ns/', mode: 'insensitive' } },
  { [urlField]: { contains: '/nibshare/', mode: 'insensitive' } },
  { [urlField]: { contains: '/share/', mode: 'insensitive' } },
];

export function publicContentWhere(domain) {
  return { deletedAt: null, website: publicSiteWhere(domain), NOT: { OR: privateLocationFilters('url') } };
}

export function publicTipWhere(contentIds) {
  return {
    contentId: { in: [...new Set(contentIds)] },
    OR: [{ domain: null }, { domain: { not: 'nibshare', mode: 'insensitive' } }],
    NOT: { OR: privateLocationFilters('contentUrl') },
  };
}

// Explicit allowlist: do not return opaque access/unlock JSON, receipt payloads,
// private publisher IDs or arbitrary fields newly added to the owner serializer.
const PUBLIC_CONTENT_FIELDS = [
  'id', 'websiteId', 'network', 'websiteName', 'websiteDomain', 'websiteVerified',
  'websiteVerificationStatus', 'websiteFaviconUrl', 'websiteOgImageUrl', 'title',
  'description', 'imageUrl', 'contentType', 'tags', 'tagList', 'tagsTentative',
  'url', 'currency', 'price', 'createdAt', 'lastSeenAt', 'metrics', 'views',
  'unlocks', 'revenue', 'avgDurationMs', 'receipts', 'ratings',
  'reputationScore', 'reputationStars',
];
export function sanitizePublicContent(content) {
  const result = Object.fromEntries(PUBLIC_CONTENT_FIELDS.filter((key) => Object.hasOwn(content, key)).map((key) => [key, content[key]]));
  if (result.url) result.url = publicContentUrl(result.url, result.websiteDomain);
  return result;
}

function publicContentUrl(storedUrl, websiteDomain) {
  try {
    const url = new URL(storedUrl);
    if (/api-subblogs\.nibgate\.xyz$/i.test(url.hostname) && websiteDomain) {
      url.hostname = websiteDomain;
      return url.toString();
    }
  } catch { /* Preserve public index metadata; callers don't invent URLs. */ }
  return storedUrl;
}

const VERIFIED_PAYMENT = { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, paymentId: { not: '' } };
const MONEY_STATUSES = ['settled', 'released', 'refunded'];
const CONTENT_SELECT = { id: true, websiteId: true, title: true, url: true, imageUrl: true, website: { select: { domain: true } } };
const RELATIONS = { content: { select: CONTENT_SELECT }, website: { select: { domain: true } } };
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function queryArgs(args) {
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '50', 10) || 50, 1), 100);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);
  const type = String(args.type || '').trim().toLowerCase();
  const domain = String(args.domain || '').trim().toLowerCase();
  if (skip > 10000 || (type && !['views', 'unlocks', 'payments', 'ratings', 'tips'].includes(type)) ||
      (domain && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(domain))) {
    throw Object.assign(new Error('Invalid public ledger filters.'), { status: 400 });
  }
  return { limit, skip, type, domain: domain || undefined };
}

const contentFields = (content) => ({
  contentId: content.id, websiteId: content.websiteId,
  contentTitle: content.title, contentUrl: publicContentUrl(content.url, content.website?.domain),
  imageUrl: content.imageUrl || null, domain: content.website?.domain || '',
});

export async function getPublicLedger(db, args = {}) {
  const { limit, skip, type, domain } = queryArgs(args);
  const site = publicSiteWhere(domain);
  const content = publicContentWhere(domain);
  const scope = { website: site, content };
  const viewsWhere = { type: 'view', ...scope };
  const paymentsWhere = { ...VERIFIED_PAYMENT, ...scope };
  const ratingsWhere = { status: 'accepted', proof: { startsWith: 'onchain:' }, ...scope };
  // Tip has no relation in Prisma. Resolve eligible content before querying,
  // and emit the indexed metadata rather than untrusted tip titles/URLs.
  const tipContent = await db.content.findMany({ where: content, select: CONTENT_SELECT });
  const byId = new Map(tipContent.map((item) => [item.id, item]));
  const tipScope = publicTipWhere([...byId.keys()]);
  const tipsWhere = { ...tipScope, status: { in: ['held', ...MONEY_STATUSES] } };
  const [views, payments, ratings, tips] = await Promise.all([
    db.metric.count({ where: viewsWhere }), db.unlockReceipt.count({ where: paymentsWhere }),
    db.contentRating.count({ where: ratingsWhere }),
    db.tip.count({ where: { ...tipScope, status: { in: ['settled', 'released'] } } }),
  ]);
  const take = skip + limit + 1;
  const order = { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take };
  const activities = [];
  if (!type || type === 'views') {
    const rows = await db.metric.findMany({ where: viewsWhere, ...order, select: {
      id: true, createdAt: true, content: RELATIONS.content,
    } });
    for (const row of rows) activities.push({ type: 'view', id: row.id, ...contentFields(row.content), timestamp: row.createdAt });
  }
  // One verified receipt is one settled payment. The unlock filter changes its
  // label, not its proof source; the combined feed does not double-count it.
  if (!type || type === 'payments' || type === 'unlocks') {
    const rows = await db.unlockReceipt.findMany({ where: paymentsWhere, ...order, select: {
      id: true, createdAt: true, amount: true, currency: true, txHash: true,
      network: true, chainId: true, paymentProvider: true, protocolFee: true,
      payerWallet: true, recipientWallet: true, content: RELATIONS.content,
    } });
    for (const row of rows) activities.push({
      type: type === 'unlocks' ? 'unlock' : 'payment', id: row.id, ...contentFields(row.content),
      timestamp: row.createdAt, amount: amount(row.amount), currency: row.currency || 'USDC',
      protocolFee: row.protocolFee ?? null, txHash: row.txHash || null,
      network: row.network || null, chainId: row.chainId || null,
      paymentProvider: row.paymentProvider, payerWallet: row.payerWallet || null,
      recipientWallet: row.recipientWallet || null, status: 'verified',
    });
  }
  if (!type || type === 'ratings') {
    const rows = await db.contentRating.findMany({ where: ratingsWhere, ...order, select: {
      id: true, createdAt: true, ratingValue: true, txHash: true, walletAddress: true, content: RELATIONS.content,
    } });
    for (const row of rows) activities.push({ type: 'rating', id: row.id, ...contentFields(row.content),
      timestamp: row.createdAt, score: Math.round(amount(row.ratingValue) / 10), txHash: row.txHash || null,
      walletAddress: row.walletAddress || null,
    });
  }
  if (!type || type === 'tips') {
    const rows = await db.tip.findMany({ where: tipsWhere, ...order, select: {
      id: true, contentId: true, createdAt: true, amount: true, currency: true,
      protocolFee: true, txHash: true, network: true, paymentProvider: true,
      payerWallet: true, recipientWallet: true, status: true,
    } });
    for (const row of rows) {
      const item = byId.get(row.contentId);
      if (!item) continue;
      activities.push({ type: 'tip', id: row.id, ...contentFields(item), timestamp: row.createdAt,
        amount: amount(row.amount), currency: row.currency || 'USDC', protocolFee: row.protocolFee ?? null,
        txHash: row.txHash || null, network: row.network || null, paymentProvider: row.paymentProvider || null,
        payerWallet: row.payerWallet || null, recipientWallet: row.recipientWallet || null, status: row.status,
      });
    }
  }
  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp) || String(b.id).localeCompare(String(a.id)) || a.type.localeCompare(b.type));
  const page = activities.slice(skip, skip + limit);
  return { success: true, activities: page, total: page.length,
    totals: { views, unlocks: payments, payments, ratings, tips, total: views + payments + ratings + tips },
    hasMore: activities.length > skip + limit && skip + limit <= 10000,
    paginationLimitReached: activities.length > skip + limit && skip + limit > 10000,
    limit, skip, scope: 'verified-indexed-content',
  };
}

export async function getPublicStats(db) {
  const site = publicSiteWhere();
  const content = publicContentWhere();
  const paymentsWhere = { ...VERIFIED_PAYMENT, website: site, content };
  const [creators, sites, contents, views, receipts] = await Promise.all([
    db.user.count({ where: { wallets: { some: {} }, websites: { some: site } } }),
    db.website.count({ where: site }), db.content.findMany({ where: content, select: { id: true } }),
    db.metric.count({ where: { type: 'view', website: site, content } }),
    db.unlockReceipt.findMany({ where: paymentsWhere, select: { amount: true, protocolFee: true } }),
  ]);
  const tips = await db.tip.findMany({ where: { ...publicTipWhere(contents.map((item) => item.id)), status: { in: MONEY_STATUSES } }, select: { amount: true, protocolFee: true, status: true } });
  const tipRevenue = tips.reduce((sum, row) => sum + amount(row.amount), 0);
  return { success: true, scope: 'verified-indexed-content', stats: {
    creators, sites, content: contents.length, views, unlocks: receipts.length,
    revenue: receipts.reduce((sum, row) => sum + amount(row.amount), 0) + tipRevenue,
    protocolFees: [...receipts, ...tips].reduce((sum, row) => sum + amount(row.protocolFee), 0),
    tips: tips.filter((row) => row.status !== 'refunded').length, tipRevenue,
  } };
}
