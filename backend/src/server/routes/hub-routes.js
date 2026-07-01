import { db } from '@nibgate/cli/src/core/db.js';
import { getUserBySession } from '@nibgate/cli/src/core/auth.js';
import crypto from 'node:crypto';

let verificationMonitorStarted = false;

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

function trackingScriptFor(website) {
  return `<script async src="https://nibgate.xyz/widget.js" data-nibgate-site="${website.id}" data-nibgate-token="${website.verifyToken}"></script>`;
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

function contentDataFor(website, payload = {}) {
  const resource = payload.resource || {};
  const url = absoluteResourceUrl(website, resource, payload.url);
  const externalId = String(resource.id || resource.contentId || resource.slug || '').trim() || null;
  const title = String(resource.title || payload.title || url).trim() || 'Untitled resource';
  const contentType = normalizeContentType(resource.type || resource.contentType);
  const tags = cleanTags(resource.tags || payload.tags);
  const pathValue = resource.path || resource.route || payload.path || null;
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
    lastSeenAt: new Date()
  };
}

async function upsertTrackedContent(website, payload = {}) {
  const resource = payload.resource || {};
  const hasResourceSignal = resource.id || resource.url || resource.path || resource.title || payload.event === 'content_registered' || payload.event === 'resource_view' || payload.event === 'resource_unlock';
  if (!hasResourceSignal) return null;

  const data = contentDataFor(website, payload);
  const idSeed = data.externalId || data.url;
  const contentId = crypto.createHash('md5').update(website.id + idSeed).digest('hex');

  return db.content.upsert({
    where: { id: contentId },
    update: data,
    create: {
      id: contentId,
      websiteId: website.id,
      ...data
    }
  });
}

function extractOriginHostname(req, payload = {}) {
  const candidate = req.headers.origin || req.headers.referer || payload.url || '';
  try {
    return new URL(candidate).hostname;
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
  const views = metrics.filter((metric) => metric.type === 'view').length;
  const unlocks = metrics.filter((metric) => metric.type === 'unlock' && ['resource_unlock', 'unlock_completed', 'unlock'].includes(metric.eventName || metric.type)).length;
  const revenue = metrics.reduce((total, metric) => total + (metric.revenue || 0), 0);
  const timeEvents = metrics.filter((metric) => metric.durationMs);
  const avgDurationMs = timeEvents.length
    ? Math.round(timeEvents.reduce((total, metric) => total + (metric.durationMs || 0), 0) / timeEvents.length)
    : 0;

  const reputationScore = contentReputationScoreFromMetrics({ views, unlocks, revenue, avgDurationMs });
  const reputationStars = contentReputationStars(reputationScore);

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
    externalId: content.externalId || '',
    lastSeenAt: content.lastSeenAt || null,
    createdAt: content.createdAt,
    metrics: content._count?.metrics || metrics.length || 0,
    views,
    unlocks,
    revenue,
    avgDurationMs,
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

export function registerHubRoutes(app) {
  startVerificationMonitor();
  
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
          include: { _count: { select: { content: true, metrics: true } } }
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
            include: { _count: { select: { content: true, metrics: true } } }
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
        include: { _count: { select: { content: true, metrics: true } } }
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
        include: { _count: { select: { content: true, metrics: true } } },
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
        include: { _count: { select: { content: true, metrics: true } } }
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
        include: { _count: { select: { content: true, metrics: true } } }
      });

      res.json({ success: true, website: serializeWebsite(updatedWebsite) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove website' });
    }
  });

  app.get('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    const websites = await db.website.findMany({
      where: { ownerId: req.user.id, deletedAt: null },
      include: { content: { include: { metrics: true, website: true, _count: { select: { metrics: true } } } } }
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
        trackedContent: serializedContent.length,
        createdAt: req.user.createdAt
      }
    });
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
          metrics: { where: metricDateWhere },
          _count: { select: { metrics: true } }
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
            _count: { select: { metrics: true } }
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
          include: { website: { include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } } }, metrics: true, _count: { select: { metrics: true } } },
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
          include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } }, content: { include: { website: true, metrics: true, _count: { select: { metrics: true } } } }, _count: { select: { content: true, metrics: true } } },
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
        include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }, websites: { where: { deletedAt: null }, include: { content: { include: { website: true, metrics: true, _count: { select: { metrics: true } } } } } } },
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
          _count: { select: { metrics: true } }
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
