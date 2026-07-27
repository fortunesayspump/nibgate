import { db } from '@nibgate/internal/db.js';
import { getUserBySession } from '@nibgate/internal/auth.js';
import { deleteManagedProfileImage } from './upload-routes.js';
import {
  cleanDomain, isValidDomain, originFor, serializeWebsite,
  hostnameMatchesSite, eventTypeFor, cleanEventName, clientIpFor, hashValue,
  trackingVisitorHash, checkTrackingRateLimit,
  metricIdentity, claimMetricDedupeKey, dedupeBucketStart, dateRangeWhere,
  normalizeContentType, upsertTrackedContent, resourcesFromManifest,
  paymentPayload, walletFromPayload, paymentIdFromPayload, upsertUnlockReceipt,
  upsertContentRating, contentHashFor, verifySignedRating,
  upsertOnchainRatingForContent, createMetric,
  syncWebsiteManifest, checkWebsiteVerification,
  serializeContent, serializePublisherIdentity,
  siteReputationScore, creatorReputationScore, primaryWalletAddress,
  ratingAverage, acceptedRatingCount,
  publisherPayloadFor, upsertPublisherIdentity, contentDataFor
} from '../hub/helpers.js';
import { startVerificationMonitor, startManifestSyncMonitor, startReputationIndexer } from '../hub/monitors.js';

async function requireAuth(req, res, next) {
  const sessionToken = req.cookies.auth_session;
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  req.user = user;
  next();
}

export function registerHubRoutes(app) {
  startVerificationMonitor();
  startManifestSyncMonitor();
  startReputationIndexer();

  // ── Site Registration ──────────────────────────────────────────────────

  async function registerWebsite(req, res) {
    try {
      const { domain, name, description } = req.body || {};
      if (!domain) return res.status(400).json({ error: 'Domain is required.' });
      const clean = cleanDomain(domain);
      if (!isValidDomain(clean)) return res.status(400).json({ error: 'Invalid domain format.' });

      const existingWebsite = await db.website.findFirst({
        where: { domain: clean, deletedAt: null },
        include: { owner: true }
      });

      if (existingWebsite) {
        if (existingWebsite.owner?.id !== req.user.id) return res.status(409).json({ error: 'Domain is already registered by another user.' });
        const result = await checkWebsiteVerification(existingWebsite);
        const updated = await db.website.update({ where: { id: existingWebsite.id }, data: { ...result.data, name: name || existingWebsite.name, description: description || existingWebsite.description } });
        await syncWebsiteManifest(updated).catch(() => {});
        const website = await db.website.findUnique({ where: { id: updated.id }, include: { _count: { select: { content: true, metrics: true } } } });
        return res.json({ success: true, website: serializeWebsite(website) });
      }

      const token = hashValue(`${clean}:${req.user.id}:${Date.now()}:${Math.random()}`).slice(0, 32);
      const created = await db.website.create({
        data: { domain: clean, name: name?.trim() || clean, description: description?.trim() || null, ownerId: req.user.id, verifyToken: token },
        include: { _count: { select: { content: true, metrics: true } } }
      });

      const result = await checkWebsiteVerification(created);
      const updated = await db.website.update({ where: { id: created.id }, data: result.data });
      await syncWebsiteManifest(updated).catch(() => {});
      const website = await db.website.findUnique({ where: { id: updated.id }, include: { _count: { select: { content: true, metrics: true } } } });
      res.json({ success: true, website: serializeWebsite(website) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to register site', details: error.message });
    }
  }

  app.post('/api/hub/site/register', requireAuth, registerWebsite);
  app.post('/api/hub/sites/register', requireAuth, registerWebsite);

  // ── Site Verification ──────────────────────────────────────────────────

  app.post('/api/hub/site/verify', requireAuth, verifyWebsite);
  app.post('/api/hub/sites/:websiteId/verify', requireAuth, verifyWebsite);
  app.post('/api/hub/sites/:websiteId/recheck', requireAuth, verifyWebsite);

  async function verifyWebsite(req, res) {
    try {
      const websiteId = req.params.websiteId || req.body?.websiteId || '';
      if (!websiteId) return res.status(400).json({ error: 'Website ID is required.' });

      const website = await db.website.findUnique({ where: { id: websiteId } });
      if (!website) return res.status(404).json({ error: 'Website not found.' });

      const result = await checkWebsiteVerification(website);
      const updated = await db.website.update({ where: { id: website.id }, data: result.data });
      res.json({ success: true, verification: result, website: serializeWebsite(updated) });
    } catch (error) {
      res.status(500).json({ error: 'Verification failed', details: error.message });
    }
  }

  // ── Manifest Sync ──────────────────────────────────────────────────────

  app.post('/api/hub/sites/:websiteId/sync', requireAuth, async (req, res) => {
    try {
      const website = await db.website.findUnique({ where: { id: req.params.websiteId } });
      if (!website) return res.status(404).json({ error: 'Website not found.' });
      const result = await syncWebsiteManifest(website);
      res.json({ success: result.ok, ...result });
    } catch (error) {
      res.status(500).json({ error: 'Sync failed', details: error.message });
    }
  });

  app.post('/api/hub/sync', async (req, res) => {
    try {
      const { siteId, token } = req.body || {};
      if (!siteId || !token) return res.status(400).json({ error: 'siteId and token required.' });
      const website = await db.website.findUnique({ where: { id: siteId } });
      if (!website) return res.status(404).json({ error: 'Website not found.' });
      if (website.verifyToken !== token) return res.status(403).json({ error: 'Invalid token.' });
      const result = await syncWebsiteManifest(website);
      res.json({ success: result.ok, ...result });
    } catch (error) {
      res.status(500).json({ error: 'Sync failed', details: error.message });
    }
  });

  // ── Public Ledger / Activity Feed ─────────────────────────────────────
  // Surfaces ALL verifiable data stored by the widget/SDK:
  // Views → visitorId, referrer, url, durationMs
  // Unlocks → visitorId, revenue, content metadata
  // Payments → paymentId, txHash, chainId, network, payerWallet, recipientWallet, receiptUrl
  // Ratings → walletAddress, ratingValue, proof, txHash

  app.get('/api/hub/ledger', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10) || 50, 1), 100);
      const offset = Math.max(Number.parseInt(req.query.skip || '0', 10) || 0, 0);
      const type = String(req.query.type || '').trim().toLowerCase();

      const activities = [];

      // 1. Recent views
      if (!type || type === 'views') {
        const views = await db.metric.findMany({
          where: { type: 'view' },
          include: { content: { select: { id: true, title: true, url: true } }, website: { select: { domain: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        });
        for (const v of views) {
          activities.push({
            type: 'view', id: v.id, websiteId: v.websiteId,
            actor: v.visitorId || 'anonymous',
            contentId: v.contentId,
            contentTitle: v.content?.title || 'Unknown content',
            contentUrl: v.content?.url || v.url || '',
            domain: v.website?.domain || '',
            referrer: v.referrer || null,
            durationMs: v.durationMs || null,
            timestamp: v.createdAt,
          });
        }
      }

      // 2. Recent unlocks (unlock_completed events stored in Metric)
      if (!type || type === 'unlocks') {
        const unlocks = await db.metric.findMany({
          where: { eventName: 'unlock_completed', contentId: { not: null } },
          include: { content: { select: { id: true, title: true, url: true, price: true, currency: true } }, website: { select: { domain: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        });
        for (const u of unlocks) {
          activities.push({
            type: 'unlock', id: u.id, websiteId: u.websiteId,
            actor: u.visitorId || u.sessionId || 'user',
            contentId: u.contentId,
            contentTitle: u.content?.title || 'Unknown content',
            contentUrl: u.content?.url || u.url || '',
            domain: u.website?.domain || '',
            revenue: u.revenue || 0,
            currency: u.currency || 'USDC',
            timestamp: u.createdAt,
          });
        }
      }

      // 3. Recent payments (UnlockReceipt — full verifiable trail)
      if (!type || type === 'payments') {
        const payments = await db.unlockReceipt.findMany({
          include: { content: { select: { id: true, title: true, url: true } }, website: { select: { domain: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        });
        for (const p of payments) {
          activities.push({
            type: 'payment', id: p.id, websiteId: p.websiteId,
            actor: p.payerWallet || p.actor || 'wallet',
            contentId: p.contentId,
            contentTitle: p.content?.title || 'Unknown content',
            contentUrl: p.content?.url || '',
            domain: p.website?.domain || '',
            amount: p.amount || 0,
            currency: p.currency || 'USDC',
            timestamp: p.createdAt,
            // Verifiable payment fields
            paymentId: p.paymentId,
            txHash: p.txHash || null,
            chainId: p.chainId || null,
            network: p.network || null,
            paymentProvider: p.paymentProvider || null,
            receiptUrl: p.receiptUrl || null,
            payerWallet: p.payerWallet || null,
            recipientWallet: p.recipientWallet || null,
            status: p.status || 'verified',
          });
        }
      }

      // 4. Recent ratings (ContentRating with proofs)
      if (!type || type === 'ratings') {
        const ratings = await db.contentRating.findMany({
          where: { status: 'accepted' },
          include: { content: { select: { id: true, title: true, url: true } }, website: { select: { domain: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        });
        for (const r of ratings) {
          activities.push({
            type: 'rating', id: r.id, websiteId: r.websiteId,
            actor: r.walletAddress || r.actor || 'user',
            contentId: r.contentId,
            contentTitle: r.content?.title || 'Unknown content',
            contentUrl: r.content?.url || '',
            domain: r.website?.domain || '',
            score: Math.round((r.ratingValue || 0) / 10),
            timestamp: r.createdAt,
            // Verifiable rating fields
            walletAddress: r.walletAddress || null,
            txHash: r.txHash || null,
            proofType: r.proofType || null,
            proof: r.proof || null,
          });
        }
      }

      // Sort all by timestamp desc, cap at limit
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const result = activities.slice(0, limit);

      res.json({ success: true, activities: result, total: result.length, limit, skip: offset });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch ledger', details: error.message });
    }
  });

  // ── Onchain Rating Sync (admin) ───────────────────────────────────────

  app.post('/api/hub/reputation/ratings/sync', async (req, res) => {
    try {
      const { startReputationIndexer } = await import('../hub/monitors.js');
      startReputationIndexer();
      res.json({ success: true, message: 'Reputation indexer started.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to start reputation indexer', details: error.message });
    }
  });

  // ── Hosted Pay ──────────────────────────────────────────────────────────

  app.post('/api/hub/pay', async (req, res) => {
    try {
      const { price, recipient, title } = req.body || {};
      const resolvedRecipient = recipient || process.env.NIBGATE_SELLER_ADDRESS || '';
      if (!resolvedRecipient) return res.status(400).json({ error: 'No recipient wallet provided. Pass recipient in request body or set NIBGATE_SELLER_ADDRESS.' });

      const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server');
      const network = process.env.NIBGATE_PAYMENT_NETWORK || 'eip155:5042002';

      const middleware = createGatewayMiddleware({
        sellerAddress: resolvedRecipient,
        facilitatorUrl: process.env.NIBGATE_FACILITATOR_URL || process.env.CIRCLE_GATEWAY_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
        networks: [network],
        description: `Unlock ${title || 'content'}`,
      });

      let body = '';
      const headers = {};
      let statusCode = 200;
      let nextCalled = false;
      const requestHeaders = {};
      const sourceHeaders = req.headers || {};
      for (const key of Object.keys(sourceHeaders)) {
        requestHeaders[key.toLowerCase()] = sourceHeaders[key];
      }
      const mwReq = { method: req.method || 'GET', url: req.body?.path || '/', headers: requestHeaders };
      const mwRes = {
        get statusCode() { return statusCode; },
        set statusCode(v) { statusCode = v; },
        setHeader(name, value) { headers[name] = value; },
        end(value = '') { body = value; },
      };

      await middleware.require(`$${price || '0.01'}`)(mwReq, mwRes, () => { nextCalled = true; });

      if (!nextCalled) {
        res.status(statusCode).set(headers).send(body);
      } else {
        res.json({ success: true, payment: { paymentProvider: 'circle-gateway', verified: true, recipient: resolvedRecipient, network, amount: Number(price || 0), revenue: Number(price || 0), currency: 'USDC', payer: mwReq.payment?.payer || '', txHash: mwReq.payment?.transaction || '' } });
      }
    } catch (error) {
      res.status(500).json({ error: 'Payment processing failed', details: error.message });
    }
  });

  // ── Tracking ───────────────────────────────────────────────────────────

  app.options('/api/hub/evt', (_req, res) => res.status(204).end());
  app.options('/api/hub/track', (_req, res) => res.status(204).end());

  const trackHandler = async (req, res) => {
    try {
      const { siteId, token, event, resource, url, path, ...payload } = req.body || {};
      const extras = { referrer: req.body?.referrer || '', visitorId: req.body?.visitorId || '', sessionId: req.body?.sessionId || '' };
      if (!siteId || !token) return res.status(400).json({ error: 'Missing siteId or token.' });

      const website = await db.website.findUnique({ where: { id: siteId } });
      if (!website || website.verifyToken !== token) return res.status(403).json({ error: 'Invalid site credentials.' });
      if (website.deletedAt) return res.status(410).json({ error: 'This site has been removed.' });

      const rateCheck = checkTrackingRateLimit(siteId, req, visitorId || '');
      if (!rateCheck.ok) return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rateCheck.retryAfter });

      const eventName = cleanEventName(event);
      const metricType = eventTypeFor(event);
      const content = eventName !== 'page_view' ? await upsertTrackedContent(website, { resource, event: eventName, url, path, ...extras, ...payload }) : null;

      if (metricType === 'content' && content) {
        await createMetric(website, content, { resource, event: eventName, ...extras, ...payload, url, path, headers: req.headers, ip: clientIpFor(req) }, eventName, 'content');
        await upsertPublisherIdentity(website, { resource, ...extras, ...payload });
      }
      if (['unlock', 'payment'].includes(metricType) && content) {
        await createMetric(website, content, { resource, event: eventName, ...extras, ...payload, url, path, headers: req.headers, ip: clientIpFor(req) }, eventName, metricType);
        await upsertUnlockReceipt(website, content, { resource, event: eventName, ...extras, ...payload }, eventName);
      }
      if (metricType === 'rating' && content) {
        if (payload.paymentMethod === 'onchain' && payload.txHash) {
          const onchain = await upsertOnchainRatingForContent(content, { rater: walletFromPayload(payload), rating: payload.ratingValue }, payload.txHash);
          if (onchain.ok) await createMetric(website, content, { resource, event: eventName, ...extras, ...payload }, eventName, 'rating');
        } else {
          const rating = await upsertContentRating(website, content, { resource, event: eventName, ...extras, ...payload }, eventName);
          if (rating) await createMetric(website, content, { resource, event: eventName, ...extras, ...payload }, eventName, 'rating');
        }
      }
      if (metricType === 'view') {
        const viewContent = content || await upsertTrackedContent(website, { resource, event: eventName, url, path, ...extras, ...payload });
        await createMetric(website, viewContent, { resource, event: eventName, ...extras, ...payload, url, path, headers: req.headers, ip: clientIpFor(req) }, eventName, 'view');
      }
      if (['time', 'engagement'].includes(metricType) && content) {
        await createMetric(website, content, { resource, event: eventName, ...extras, ...payload, url, path, headers: req.headers, ip: clientIpFor(req) }, eventName, metricType);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to track event', details: error.message });
    }
  };

  app.post('/api/hub/evt', trackHandler);
  app.post('/api/hub/track', trackHandler);

  // ── List Sites ─────────────────────────────────────────────────────────

  app.get('/api/hub/sites', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        include: { _count: { select: { content: true, metrics: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ success: true, websites: websites.map(serializeWebsite) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sites' });
    }
  });

  // ── Delete Site ────────────────────────────────────────────────────────

  app.delete('/api/hub/sites/:websiteId', requireAuth, async (req, res) => {
    try {
      const website = await db.website.findUnique({ where: { id: req.params.websiteId } });
      if (!website) return res.status(404).json({ error: 'Website not found.' });
      if (website.ownerId !== req.user.id) return res.status(403).json({ error: 'Not your site.' });

      await db.website.update({ where: { id: website.id }, data: { deletedAt: new Date() } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete site' });
    }
  });

  // ── Dashboard: Profile ─────────────────────────────────────────────────

  app.get('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    try {
      const user = await db.user.findUnique({
        where: { id: req.user.id },
        include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } }
      });
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const websites = await db.website.findMany({
        where: { ownerId: user.id, deletedAt: null },
        include: { content: { include: { metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } } }
      });
      const allContent = websites.flatMap((w) => w.content.map(serializeContent));
      const score = creatorReputationScore(allContent, websites);

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username || '',
          bio: user.bio || '',
          avatarUrl: user.avatarUrl || '',
          walletAddress: primaryWalletAddress(user),
          wallets: user.wallets || [],
          createdAt: user.createdAt
        },
        reputation: { reputationScore: score },
        stats: {
          sites: websites.length,
          contentCount: allContent.length,
          views: allContent.reduce((s, c) => s + c.views, 0),
          unlocks: allContent.reduce((s, c) => s + c.unlocks, 0),
          revenue: allContent.reduce((s, c) => s + c.revenue, 0),
          ratings: allContent.reduce((s, c) => s + (c.ratings || 0), 0)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
    }
  });

  // ── Dashboard: Publishers ──────────────────────────────────────────────

  app.get('/api/hub/dashboard/publishers', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true }
      });
      const websiteIds = websites.map((w) => w.id);

      const publishers = await db.publisherIdentity.findMany({
        where: { websiteId: { in: websiteIds } },
        include: { _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, publishers: publishers.map(serializePublisherIdentity) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch publishers' });
    }
  });

  // ── Dashboard: Update Profile ──────────────────────────────────────────

  app.put('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    try {
      const { username, bio, avatarUrl } = req.body || {};
      const data = {};
      if (username !== undefined) data.username = String(username).trim().slice(0, 60) || null;
      if (bio !== undefined) data.bio = String(bio).trim().slice(0, 500) || null;
      if (avatarUrl !== undefined) data.avatarUrl = String(avatarUrl).trim().slice(0, 500) || null;

      const user = await db.user.update({ where: { id: req.user.id }, data, include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } });
      res.json({ success: true, user: { id: user.id, username: user.username || '', bio: user.bio || '', avatarUrl: user.avatarUrl || '', walletAddress: primaryWalletAddress(user) } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // ── Dashboard: List Content ────────────────────────────────────────────

  app.get('/api/hub/dashboard/content', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true }
      });
      const websiteIds = websites.map((w) => w.id);

      const content = await db.content.findMany({
        where: { websiteId: { in: websiteIds }, deletedAt: null },
        include: { website: true, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number.parseInt(req.query.limit || '200', 10) || 200, 1), 500)
      });

      res.json({ success: true, fields: ['id', 'title', 'type', 'price', 'views', 'unlocks', 'revenue', 'ratings', 'reputationScore', 'createdAt'], content: content.map(serializeContent) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch content' });
    }
  });

  // ── Rate Content (Authenticated) ────────────────────────────────────────

  app.post('/api/hub/content/:contentId/rate', requireAuth, async (req, res) => {
    try {
      const content = await db.content.findUnique({ where: { id: req.params.contentId } });
      if (!content) return res.status(404).json({ error: 'Content not found.' });
      if (content.deletedAt) return res.status(410).json({ error: 'Content has been deleted.' });

      const walletAddress = String(req.body?.walletAddress || '').trim().toLowerCase();
      if (!walletAddress) return res.status(400).json({ error: 'walletAddress is required.' });

      const ratingValue = Math.max(1, Math.min(5, Math.round(Number(req.body?.ratingValue || req.body?.rating || 0))));
      if (ratingValue < 1) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });

      const unlock = await db.unlockReceipt.findFirst({
        where: { contentId: content.id, OR: [{ payerWallet: walletAddress }, { txHash: req.body?.txHash || '' }, { paymentId: req.body?.paymentId || '' }] }
      });
      if (!unlock) return res.status(403).json({ error: 'Rating wallet has no unlock receipt for this content.' });

      const website = await db.website.findUnique({ where: { id: content.websiteId } });

      const payload = {
        resource: { ...req.body, id: content.externalId || content.id },
        ratingValue: ratingValue * 10,
        signature: req.body?.signature || req.body?.ratingSignature || '',
        message: req.body?.ratingMessage || '',
        walletAddress,
        paymentId: unlock.paymentId,
        txHash: req.body?.txHash || unlock.txHash || ''
      };

      const rating = await upsertContentRating(website, content, payload, 'rating_submitted');
      if (!rating) return res.status(500).json({ error: 'Failed to record rating.' });

      res.json({ success: true, rating: { id: rating.id, contentId: content.id, walletAddress, ratingValue: rating.ratingValue / 10 } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to rate content', details: error.message });
    }
  });

  // ── Reputation: Prepare Rating (Off-chain Signed) ───────────────────────

  app.post('/api/hub/reputation/ratings/prepare', async (req, res) => {
    try {
      const { contentId, walletAddress, ratingValue: rawRating, paymentId, pageOrigin } = req.body || {};
      if (!contentId || !walletAddress || !rawRating) return res.status(400).json({ error: 'Missing required fields: contentId, walletAddress, ratingValue.' });

      const ratingVal = Math.max(1, Math.min(50, Math.round(Number(rawRating))));
      const content = await db.content.findUnique({ where: { id: contentId }, include: { website: true } });
      if (!content) return res.status(404).json({ error: 'Content not found.' });

      const message = [
        'Nibgate content rating',
        `site:${content.website.domain}`,
        `content:${content.externalId || content.id}`,
        `url:${content.url}`,
        `rating:${ratingVal}`,
        'I confirm this rating is tied to my unlock/payment proof.'
      ].join('\n');

      const contentHash = contentHashFor(content.website, content);

      res.json({
        success: true, message, ratingValue: ratingVal, contentHash,
        contractAddress: process.env.NIBGATE_REPUTATION_CONTRACT || '',
        chainId: process.env.NIBGATE_REPUTATION_CHAIN_ID || '5042002',
        chainName: process.env.NIBGATE_REPUTATION_CHAIN_NAME || 'Arc Testnet',
        rpcUrl: process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/'
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to prepare rating', details: error.message });
    }
  });

  // ── Reputation: Index Onchain Rating ────────────────────────────────────

  app.post('/api/hub/reputation/ratings/index', async (req, res) => {
    try {
      const { contentId, txHash, walletAddress, contentHash, ratingValue, pageOrigin } = req.body || {};
      const content = await db.content.findUnique({ where: { id: contentId }, include: { website: true } });
      if (!content) return res.status(404).json({ error: 'Content not found.' });

      const result = await upsertOnchainRatingForContent(content, {
        contentId: contentHash || contentHashFor(content.website, content),
        rater: walletAddress || '',
        rating: ratingValue || 0,
        proof: txHash || ''
      }, txHash || '');

      res.json({ success: result.ok, ...result });
    } catch (error) {
      res.status(500).json({ error: 'Failed to index rating', details: error.message });
    }
  });

  // ── Dashboard: Analytics ────────────────────────────────────────────────

  app.get('/api/hub/dashboard/analytics', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true }
      });
      const websiteIds = websites.map((w) => w.id);

      const content = await db.content.findMany({
        where: { websiteId: { in: websiteIds }, deletedAt: null },
        include: { website: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200
      });

      const serialized = content.map(serializeContent);
      const totalViews = serialized.reduce((sum, item) => sum + item.views, 0);
      const totalUnlocks = serialized.reduce((sum, item) => sum + item.unlocks, 0);
      const totalRevenue = serialized.reduce((sum, item) => sum + item.revenue, 0);
      const totalRatings = serialized.filter((item) => (item.ratings || 0) > 0).length;
      const avgReputation = serialized.filter((item) => item.reputationScore).reduce((sum, item, _, arr) => sum + (item.reputationScore || 0) / arr.length, 0);

      res.json({
        success: true,
        summary: { views: totalViews, unlocks: totalUnlocks, revenue: totalRevenue, ratedContent: totalRatings, avgReputationScore: Math.round(avgReputation * 10) / 10 || null },
        content: serialized.slice(0, 50)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
    }
  });

  // ── Dashboard: Earnings ──────────────────────────────────────────────────

  app.get('/api/hub/dashboard/earnings', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id, deletedAt: null },
        select: { id: true }
      });
      const websiteIds = websites.map((w) => w.id);

      const timeFilter = dateRangeWhere(req);

      const metrics = await db.metric.findMany({
        where: {
          websiteId: { in: websiteIds },
          type: { in: ['unlock', 'payment'] },
          ...timeFilter
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10) || 100, 1), 500)
      });

      const receipts = await db.unlockReceipt.findMany({
        where: { websiteId: { in: websiteIds }, ...timeFilter },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { content: { select: { id: true, title: true, externalId: true } } }
      });

      const byCurrency = {};
      for (const metric of metrics) {
        const curr = metric.currency || 'USDC';
        byCurrency[curr] = (byCurrency[curr] || 0) + (metric.revenue || 0);
      }

      res.json({
        success: true,
        summary: { revenue: metrics.reduce((sum, m) => sum + (m.revenue || 0), 0), unlocks: metrics.length, byCurrency, receiptCount: receipts.length },
        receipts: receipts.map((r) => ({
          id: r.id, contentId: r.contentId, contentTitle: r.content?.title || '', amount: r.amount, currency: r.currency || 'USDC',
          paymentProvider: r.paymentProvider, txHash: r.txHash, receiptUrl: r.receiptUrl, payerWallet: r.payerWallet, status: r.status, createdAt: r.createdAt
        }))
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch earnings', details: error.message });
    }
  });

  // ── Sitemap: List Active Sites ──────────────────────────────────────────

  app.get('/api/hub/sitemap-sites', async (req, res) => {
    try {
      const sites = await db.website.findMany({
        where: { deletedAt: null },
        select: { domain: true },
        orderBy: { createdAt: 'desc' }
      });
      res.json({ success: true, sites: sites.filter((s) => s.domain?.endsWith('.nibgate.xyz')).map((s) => s.domain) });
    } catch (error) {
      res.json({ success: true, sites: [] });
    }
  });

  // ── Reputation: Leaderboards ─────────────────────────────────────────────

  app.get('/api/hub/reputation/leaderboards', async (req, res) => {
    try {
      const type = String(req.query.type || 'creators').trim().toLowerCase();
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10) || 20, 1), 50);

      if (type === 'content') {
        const content = await db.content.findMany({
          where: { deletedAt: null, website: { deletedAt: null } },
          include: { website: { include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } } }, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
          take: 500,
          orderBy: { createdAt: 'desc' }
        });
        const items = content.map(serializeContent)
          .slice(0, 200)
          .map((content, index) => ({ rank: index + 1, ...content }));
        return res.json({ success: true, type: 'content', items });
      }

      if (type === 'sites') {
        const websites = await db.website.findMany({
          where: { deletedAt: null },
          include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } }, content: { include: { website: true, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } }, _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } },
          take: 200,
          orderBy: { createdAt: 'desc' }
        });
        const items = websites.map((website) => {
          const content = website.content.map(serializeContent);
          const score = siteReputationScore(content, website);
          return {
            id: website.id, name: website.name, domain: website.domain, description: website.description || '',
            faviconUrl: website.faviconUrl || '', ownerName: website.owner?.username || '',
            ownerWallet: primaryWalletAddress(website.owner || {}), reputationScore: score,
            contentCount: content.length, views: content.reduce((sum, item) => sum + item.views, 0),
            unlocks: content.reduce((sum, item) => sum + item.unlocks, 0),
            revenue: content.reduce((sum, item) => sum + item.revenue, 0),
            verificationStatus: website.verificationStatus || '', lastVerifiedAt: website.lastVerifiedAt || null
          };
        }).sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views)).slice(0, limit).map((site, index) => ({ rank: index + 1, ...site }));
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
        return {
          id: user.id, name: user.username || 'Unnamed creator',
          walletAddress: primaryWalletAddress(user), avatarUrl: user.avatarUrl || '', bio: user.bio || '',
          reputationScore: score, verifiedSites: websites.filter((w) => w.isVerified && w.verificationStatus === 'verified').length,
          siteCount: websites.length, contentCount: content.length, views: content.reduce((s, c) => s + c.views, 0),
          unlocks: content.reduce((s, c) => s + c.unlocks, 0), revenue: content.reduce((s, c) => s + c.revenue, 0)
        };
      }).filter((creator) => creator.contentCount > 0 || creator.verifiedSites > 0)
        .sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views))
        .slice(0, limit)
        .map((creator, index) => ({ rank: index + 1, ...creator }));
      return res.json({ success: true, type: 'creators', items });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch reputation leaderboards', details: error.message });
    }
  });

  // ── Explore: Content Discovery ──────────────────────────────────────────

  app.get('/api/hub/explore/content', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const type = normalizeContentType(req.query.type || '');
      const requestedType = String(req.query.type || '').trim().toLowerCase();
      const sort = String(req.query.sort || 'trending').trim().toLowerCase();
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10) || 100, 1), 200);
      const skip = Math.max(Number.parseInt(req.query.skip || '0', 10) || 0, 0);

      const where = {
        deletedAt: null,
        website: { deletedAt: null },
        ...(requestedType && requestedType !== 'all' ? { contentType: type } : {}),
        ...(q ? { OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tags: { contains: q, mode: 'insensitive' } },
          { website: { name: { contains: q, mode: 'insensitive' } } },
          { website: { domain: { contains: q, mode: 'insensitive' } } }
        ] } : {})
      };

      const [content, total] = await Promise.all([
        db.content.findMany({
          where,
          include: { website: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        db.content.count({ where })
      ]);

      const serialized = content.map(serializeContent);
      const sorted = serialized.sort((a, b) => {
        const va = a.websiteVerified ? 1 : 0;
        const vb = b.websiteVerified ? 1 : 0;
        const imgA = a.imageUrl ? 1 : 0;
        const imgB = b.imageUrl ? 1 : 0;
        if (sort === 'best-sellers') return (vb - va) || (imgB - imgA) || (b.unlocks - a.unlocks) || (b.revenue - a.revenue) || (b.views - a.views);
        if (sort === 'hot-new') return (vb - va) || (imgB - imgA) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return (vb - va) || (imgB - imgA) || (b.views + b.unlocks * 4 + b.revenue * 20) - (a.views + a.unlocks * 4 + a.revenue * 20);
      });

      res.json({ success: true, content: sorted, total, limit, skip });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch explore content' });
    }
  });

  // ── Blog Linking ──────────────────────────────────────────────────────────

  app.post('/api/hub/blog/link/generate', requireAuth, async (req, res) => {
    try {
      const crypto = await import('node:crypto');
      const code = crypto.randomBytes(16).toString('hex');
      const expiresAt = Date.now() + 15 * 60 * 1000;
      const payload = JSON.stringify({ userId: req.user.id, code, expiresAt });
      const secret = process.env.JWT_SECRET || 'nibgate-link-secret';
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const linkToken = `${code}.${Buffer.from(payload).toString('base64url')}.${signature}`;

      res.json({ success: true, linkToken, expiresIn: 900, message: 'Paste this code in your blog admin settings to link your blog to your Nibgate hub account.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate linking code', details: error.message });
    }
  });

  app.post('/api/hub/blog/link/verify', async (req, res) => {
    try {
      const { linkToken, domain, name } = req.body || {};
      if (!linkToken || !domain) return res.status(400).json({ error: 'linkToken and domain are required.' });

      const crypto = await import('node:crypto');
      const parts = linkToken.split('.');
      if (parts.length !== 3) return res.status(400).json({ error: 'Invalid link token format.' });

      const [, encodedPayload, signature] = parts;
      const secret = process.env.JWT_SECRET || 'nibgate-link-secret';
      const decodedPayload = Buffer.from(encodedPayload, 'base64url').toString();
      const expectedSig = crypto.createHmac('sha256', secret).update(decodedPayload).digest('hex');
      if (signature !== expectedSig) return res.status(403).json({ error: 'Invalid link token.' });

      let payload;
      try { payload = JSON.parse(decodedPayload); } catch { return res.status(400).json({ error: 'Invalid link token payload.' }); }

      if (Date.now() > payload.expiresAt) return res.status(410).json({ error: 'Link token has expired. Generate a new one from your hub dashboard.' });

      const user = await db.user.findUnique({ where: { id: payload.userId } });
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const clean = cleanDomain(domain);
      const existing = await db.website.findFirst({ where: { domain: clean, deletedAt: null } });

      if (existing && existing.ownerId !== user.id) {
        return res.status(409).json({ error: 'Domain is already registered by another user.' });
      }

      const website = existing || await db.website.create({
        data: { domain: clean, name: name?.trim() || clean, ownerId: user.id, isVerified: true, verificationStatus: 'verified', siteToken: crypto.randomBytes(24).toString('hex'), verifyToken: hashValue(`${clean}:${user.id}:${Date.now()}:${Math.random()}`).slice(0, 32) },
      });

      await syncWebsiteManifest(website).catch(() => {});

      res.json({
        success: true,
        siteId: website.id,
        verifyToken: website.verifyToken,
        domain: clean,
        site: serializeWebsite(website),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to verify link token', details: error.message });
    }
  });

  app.post('/api/hub/blog/link/disconnect', async (req, res) => {
    try {
      const { siteId, verifyToken } = req.body || {};
      if (!siteId || !verifyToken) return res.status(400).json({ error: 'siteId and verifyToken are required.' });

      const website = await db.website.findUnique({ where: { id: siteId } });
      if (!website) return res.status(404).json({ error: 'Website not found.' });
      if (website.verifyToken !== verifyToken) return res.status(403).json({ error: 'Invalid verify token.' });
      if (website.deletedAt) return res.status(410).json({ error: 'Site already removed.' });

      await db.website.update({ where: { id: website.id }, data: { deletedAt: new Date() } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to disconnect site', details: error.message });
    }
  });
}
