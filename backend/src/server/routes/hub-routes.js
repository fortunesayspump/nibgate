import { db } from '@nibgate/internal/db.js';
import { requireAuth } from '@nibgate/internal/auth.js';
import { activeNetwork } from '@nibgate/internal/networks.js';
import { randomBytes } from 'node:crypto';
import { runHostedPayRequirement } from '@nibgate/sdk/server';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { deleteManagedProfileImage } from './upload-routes.js';
import {
  cleanDomain, isValidDomain, originFor, serializeWebsite,
  hostnameMatchesSite, eventTypeFor, cleanEventName, clientIpFor, hashValue, cleanTags,
  trackingVisitorHash, checkTrackingRateLimit,
  metricIdentity, claimMetricDedupeKey, dedupeBucketStart, dateRangeWhere,
  normalizeContentType, upsertTrackedContent, resourcesFromManifest,
  paymentPayload, walletFromPayload, paymentIdFromPayload, upsertUnlockReceipt, paymentLikeId,
  upsertContentRating, contentHashFor, verifySignedRating,
  upsertOnchainRatingForContent, createMetric,
  syncWebsiteManifest, checkWebsiteVerification,
  maybeAdoptPeerVerification, adoptCrossStackIfStale, fetchPeerVerification, peerHubApiBase,
  localCanonicalDomain, normalizeWalletAddress, mintBlogLinkToken, verifyBlogLinkToken,
  resolveUserByWallet, checkPeerSecret, mirrorPeerSite, fetchPeerIdentity, siteIdentityFor,
  serializeContent, serializePublisherIdentity,
  siteReputationScore, creatorReputationScore, primaryWalletAddress,
  ratingAverage, acceptedRatingCount,
  publisherPayloadFor, upsertPublisherIdentity, contentDataFor,
  findContentByIdOrExternal
} from '../hub/helpers.js';
import { startVerificationMonitor, startManifestSyncMonitor, startReputationIndexer, startDataIntegrityMonitor, startGscSitemapMonitor, startGscIndexMonitor } from '../hub/monitors.js';
import { startFeeKeeper } from '../revenue/keeper.js';

export function registerHubRoutes(app) {
  startVerificationMonitor();
  startManifestSyncMonitor();
  startReputationIndexer();
  startDataIntegrityMonitor();
  startGscSitemapMonitor();
  startGscIndexMonitor();
  // The keeper sweeps matured gateway balances on a timer. Payment-flow
  // stress/e2e runs set NIBGATE_DISABLE_KEEPER=true so sweeps can't drain a
  // buyer's (or wallet's) ledger between maturation and spend.
  if (process.env.NIBGATE_DISABLE_KEEPER !== 'true') {
    startFeeKeeper();
  }

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
        const adopted = await maybeAdoptPeerVerification(result, existingWebsite);
        const updated = await db.website.update({ where: { id: existingWebsite.id }, data: { ...adopted.data, name: name || existingWebsite.name, description: description || existingWebsite.description } });
        await syncWebsiteManifest(updated).catch(() => {});
        const website = await db.website.findUnique({ where: { id: updated.id }, include: { _count: { select: { content: true, metrics: true } } } });
        return res.json({ success: true, website: serializeWebsite(website) });
      }

      const token = hashValue(`${clean}:${req.user.id}:${Date.now()}:${Math.random()}`).slice(0, 32);
      const siteToken = randomBytes(24).toString('hex');
      const created = await db.website.create({
        data: { domain: clean, name: name?.trim() || clean, description: description?.trim() || null, ownerId: req.user.id, verifyToken: token, siteToken },
        include: { _count: { select: { content: true, metrics: true } } }
      });

      const result = await checkWebsiteVerification(created);
      const adopted = await maybeAdoptPeerVerification(result, created);
      const updated = await db.website.update({ where: { id: created.id }, data: adopted.data });
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

  // Public cross-stack verification status for a canonical domain. Serves two
  // jobs: the peer-facing proof endpoint the other hub consults, and a badge
  // endpoint that keeps sites verified network-wide without a manual re-click.
  app.get('/api/hub/site/verify-status', async (req, res) => {
    try {
      const domain = cleanDomain(String(req.query?.domain || ''));
      if (!domain) return res.status(400).json({ error: 'domain is required.' });
      const website = await db.website.findFirst({ where: { domain, deletedAt: null } });
      if (website && website.isVerified && website.verificationStatus === 'verified') {
        return res.json({
          success: true, verified: true, verificationStatus: 'verified',
          domain, name: website.name, lastVerifiedAt: website.lastVerifiedAt || null,
          verificationSource: website.verificationSource || 'widget',
          ...(await siteIdentityFor(website)),
        });
      }
      if (website) {
        const adopted = await adoptCrossStackIfStale(website);
        if (adopted.isVerified && adopted.verificationStatus === 'verified') {
          return res.json({
            success: true, verified: true, verificationStatus: 'verified',
            domain, name: adopted.name, lastVerifiedAt: adopted.lastVerifiedAt || null, verificationSource: 'cross-stack',
            ...(await siteIdentityFor(adopted)),
          });
        }
      }
      return res.json({ success: true, verified: false, verificationStatus: website?.verificationStatus || 'unknown', domain });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to check verification status', details: error.message });
    }
  });

  // Secret-gated peer identity index: verified sites with owner wallets and
  // publisher profile, for hub-to-hub identity sync (x-peer-secret must equal
  // the shared BLOG_LINK_SECRET). No content, receipts, ratings, or metrics.
  app.get('/api/hub/site/verified-identities', async (req, res) => {
    try {
      if (!checkPeerSecret(req)) return res.status(403).json({ error: 'Forbidden.' });
      const websites = await db.website.findMany({
        where: { deletedAt: null, isVerified: true, verificationStatus: 'verified' },
        include: { owner: { include: { wallets: true } }, publishers: { orderBy: { createdAt: 'asc' }, take: 1 } },
        orderBy: { domain: 'asc' },
        take: 500,
      });
      res.json({
        success: true,
        sites: await Promise.all(websites.map(async (w) => ({
          domain: w.domain,
          verificationStatus: 'verified',
          lastVerifiedAt: w.lastVerifiedAt || null,
          verificationSource: w.verificationSource || 'widget',
          ...(await siteIdentityFor(w)),
        }))),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to list verified identities', details: error.message });
    }
  });

  // Secret-gated identity mirror: provision identity-only rows for
  // peer-verified sites (translated to local canonical domains). Copies site
  // identity + verification + owner (by wallet) + publisher profile. NEVER
  // copies content, receipts, ratings, or metrics.
  app.post('/api/hub/site/sync-from-peer', async (req, res) => {
    try {
      if (!checkPeerSecret(req)) return res.status(403).json({ error: 'Forbidden.' });
      const { domains, all } = req.body || {};
      let identities = [];
      if (all) {
        const base = peerHubApiBase();
        const secret = (process.env.BLOG_LINK_SECRET || '').trim();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch(`${base}/api/hub/site/verified-identities`, { signal: controller.signal, headers: { 'x-peer-secret': secret } });
          if (!resp.ok) return res.status(502).json({ error: 'Peer identity index unreachable.' });
          identities = (await resp.json()).sites || [];
        } finally {
          clearTimeout(timer);
        }
      } else if (Array.isArray(domains) && domains.length) {
        for (const domain of domains.slice(0, 200)) {
          const identity = await fetchPeerIdentity(domain);
          if (identity) identities.push(identity);
        }
      } else {
        return res.status(400).json({ error: 'Provide domains[] or all:true.' });
      }
      const synced = [];
      const skipped = [];
      for (const identity of identities) {
        try {
          const row = await mirrorPeerSite(identity);
          if (row) synced.push({ domain: identity.domain, localDomain: row.domain, siteId: row.id });
          else skipped.push({ domain: identity.domain, reason: 'not verifiable (no owner wallet or invalid domain)' });
        } catch (error) {
          skipped.push({ domain: identity.domain, reason: error.message });
        }
      }
      res.json({ success: true, synced, skipped });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Identity sync failed', details: error.message });
    }
  });

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
      const adopted = await maybeAdoptPeerVerification(result, website);
      const updated = await db.website.update({ where: { id: website.id }, data: adopted.data });
      res.json({ success: true, verification: adopted, website: serializeWebsite(updated) });
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

  app.post('/api/hub/site/info', async (req, res) => {
    try {
      const { siteId, token } = req.body || {};
      if (!siteId || !token) return res.status(400).json({ error: 'siteId and token required.' });
      const website = await db.website.findUnique({ where: { id: siteId }, include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } } });
      if (!website) return res.status(404).json({ error: 'Website not found.' });
      if (website.verifyToken !== token) return res.status(403).json({ error: 'Invalid token.' });
      const primaryWallet = website.owner?.wallets?.find((w) => w.isPrimary) || website.owner?.wallets?.[0];
      res.json({ success: true, site: { ownerWallet: primaryWallet?.address || '', name: website.name, domain: website.domain } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch site info', details: error.message });
    }
  });

  // ── Public Ledger / Activity Feed ─────────────────────────────────────
  // Surfaces ALL verifiable data stored by the widget/SDK:
  // Views → visitorId, referrer, url, durationMs
  // Unlocks → visitorId, revenue, content metadata
  // Payments → paymentId, txHash, chainId, network, payerWallet, recipientWallet, receiptUrl
  // Ratings → walletAddress, ratingValue, proof, txHash

  // Display-only: content rows may store the API-origin URL
  // (…-api-subblogs.nibgate.xyz) while readers expect the public blog host.
  // Rewrite the host at read time using the row's own website domain — stored
  // identity strings stay untouched so on-chain content hashes never drift.
  const publicContentUrl = (storedUrl = '', websiteDomain = '') => {
    try {
      const u = new URL(String(storedUrl || ''));
      if (/api-subblogs\.nibgate\.xyz$/i.test(u.hostname) && websiteDomain) {
        u.hostname = String(websiteDomain).toLowerCase();
        return u.toString();
      }
      return String(storedUrl || '');
    } catch { return String(storedUrl || ''); }
  };

  app.get('/api/hub/ledger', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50', 10) || 50, 1), 100);
      const offset = Math.max(Number.parseInt(req.query.skip || '0', 10) || 0, 0);
      const type = String(req.query.type || '').trim().toLowerCase();
      const domain = String(req.query.domain || '').trim().toLowerCase() || undefined;
      const siteWhere = domain ? { website: { domain } } : { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } };

      // Total counts (optionally filtered by domain). Unlocks and Payments both
      // count the SAME authoritative set — verified, deduplicated UnlockReceipts
      // (one verified paid unlock = one settled payment). Counting raw lock
      // events here over/under-counts: unlock_completed once fired per visitor
      // session and even for contents whose only receipt is invalid, so the
      // totals drifted from the ledger (e.g. 796 events vs 780 verified). Both
      // surfaces stay in lockstep on the verified ledger.
      const verifiedUnlockWhere = { ...siteWhere, status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] } };
      const [totalViews, totalUnlocks, totalPayments, totalRatings] = await Promise.all([
        db.metric.count({ where: { type: 'view', contentId: { not: null }, ...siteWhere } }),
        db.unlockReceipt.count({ where: verifiedUnlockWhere }),
        db.unlockReceipt.count({ where: verifiedUnlockWhere }),
        db.contentRating.count({ where: { status: 'accepted', proof: { startsWith: 'onchain:' }, ...siteWhere } }),
      ]);

      const activities = [];

      // 1. Recent views
      if (!type || type === 'views') {
        const views = await db.metric.findMany({
          where: { type: 'view', contentId: { not: null }, ...siteWhere },
          include: { content: { select: { id: true, title: true, url: true, imageUrl: true } }, website: { select: { domain: true } } },
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
            contentUrl: publicContentUrl(v.content?.url || v.url || '', v.website?.domain || ''),
            imageUrl: v.content?.imageUrl || null,
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
          where: { eventName: 'unlock_completed', contentId: { not: null }, ...siteWhere },
          include: { content: { select: { id: true, title: true, url: true, imageUrl: true, price: true, currency: true } }, website: { select: { domain: true } } },
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
            contentUrl: publicContentUrl(u.content?.url || u.url || '', u.website?.domain || ''),
            imageUrl: u.content?.imageUrl || null,
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
          where: { ...siteWhere, status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] } },
          include: { content: { select: { id: true, title: true, url: true, imageUrl: true } }, website: { select: { domain: true } } },
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
            contentUrl: publicContentUrl(p.content?.url || '', p.website?.domain || ''),
            imageUrl: p.content?.imageUrl || null,
            domain: p.website?.domain || '',
            amount: p.amount || 0,
            protocolFee: p.protocolFee ?? null,
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
          where: { status: 'accepted', proof: { startsWith: 'onchain:' }, ...siteWhere },
          include: { content: { select: { id: true, title: true, url: true, imageUrl: true } }, website: { select: { domain: true } } },
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
            contentUrl: publicContentUrl(r.content?.url || '', r.website?.domain || ''),
            imageUrl: r.content?.imageUrl || null,
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

      res.json({
        success: true,
        activities: result,
        total: result.length,
        totals: { views: totalViews, unlocks: totalUnlocks, payments: totalPayments, ratings: totalRatings, total: totalViews + totalPayments + totalRatings },
        hasMore: activities.length > limit,
        limit, skip: offset
      });
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

  const hubPayLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { ok: false, error: 'Too many payment requests, slow down.' },
  });

  app.post('/api/hub/pay', hubPayLimiter, async (req, res) => {
    try {
      const { price, recipient, title, paymentRail } = req.body || {};
      let resolvedRecipient = recipient || process.env.NIBGATE_SELLER_ADDRESS || '';
      if (!resolvedRecipient) return res.status(400).json({ error: 'No recipient wallet provided. Pass recipient in request body or set NIBGATE_SELLER_ADDRESS.' });

      // This endpoint is CORS-open so any site's widget can pay. That means
      // body-supplied price/recipient are UNTRUSTED: when the contentId maps
      // to a tracked content record, server-side values win.
      let effectivePrice = price;
      const contentRecord = await findContentByIdOrExternal(req.body?.contentId);
      if (contentRecord) {
        if (contentRecord.price && Number(contentRecord.price) > 0) effectivePrice = contentRecord.price;
        if (contentRecord.recipientWallet) resolvedRecipient = contentRecord.recipientWallet;
      }

      const requestHeaders = {};
      const sourceHeaders = req.headers || {};
      for (const key of Object.keys(sourceHeaders)) {
        requestHeaders[key.toLowerCase()] = sourceHeaders[key];
      }
      const gateway = await runHostedPayRequirement(
        { method: req.method || 'GET', url: req.body?.path || '/', headers: requestHeaders },
        {
          id: req.body?.contentId || 'hub',
          title: title || 'content',
          price: String(effectivePrice),
          recipient: resolvedRecipient,
          path: req.body?.path || '/',
          paymentRail: paymentRail || req.body?.rail || undefined,
        },
        { hosted: true },
      );

      if (gateway.handled) {
        res.status(gateway.response.status).set(Object.fromEntries(gateway.response.headers.entries())).send(await gateway.response.text());
        return;
      }

      // Direct-rail payments are PUBLIC chain data: without this claim, anyone
      // could replay an observed txHash against a different resource (or site)
      // and read paid content for free. One broadcast tx pays for exactly one
      // content id, ever. Per-resource idempotency stays downstream.
      if (gateway.payment?.txHash) {
        const claimedTx = String(gateway.payment.txHash).toLowerCase();
        const claimContentId = String(req.body?.contentId || 'hub');
        try {
          await db.paymentTxClaim.create({ data: { txHash: claimedTx, contentId: claimContentId } });
        } catch (claimError) {
          if (claimError?.code === 'P2002') {
            const existing = await db.paymentTxClaim.findUnique({ where: { txHash: claimedTx } });
            if (existing && existing.contentId !== claimContentId) {
              return res.status(402).json({ ok: false, error: 'Payment already used for different content', reason: 'txhash-claimed-elsewhere' });
            }
          } else {
            throw claimError; // fail closed — the DB is already a hard dependency of this route
          }
        }
      }

      // Surface direct-rail overpay metadata: verifyTransfer stamps
      // amountReceived/overpay onto the payment when the buyer sent more than
      // the price, so downstream surfaces can flag (or refund) overpays
      // instead of silently pocketing the difference.
      const overpayFields = Number.isFinite(gateway.payment.overpay)
        ? { amountReceived: gateway.payment.amountReceived, overpay: gateway.payment.overpay }
        : {};

      // Machine parity: record every settled payment HERE so raw x402 payers
      // (AI agents, scripts — any client with no browser widget) produce the
      // same receipts/metrics/ledger entries as human widget flows. Widget
      // events dedupe on paymentId via metricIdentity/upsertUnlockReceipt,
      // so double reporting stays safe. Attribution falls back to siteId +
      // siteToken when contentId does not map to tracked hub content.
      try {
        let payWebsite = contentRecord?.website || null;
        if (!payWebsite) {
          const sid = String(req.body?.siteId || '');
          const stok = String(req.body?.siteToken || '');
          if (sid && stok) {
            const candidate = await db.website.findUnique({ where: { id: sid } }).catch(() => null);
            if (candidate && !candidate.deletedAt && candidate.verifyToken === stok) payWebsite = candidate;
          }
        }
        if (payWebsite && Number(effectivePrice) > 0) {
          const payOrigin = `${req.protocol}://${req.get('host')}`;
          const payPath = String(req.body?.path || '/');
          let payUrl = String(req.body?.url || '') || payOrigin + payPath;
          // Canonicalize self-referential URLs: a caller reporting the API's
          // own host as the content origin (e.g. proxies that omit `url`)
          // would create a second content row for the same post, and every
          // dedupe key includes contentId — so the same payment would then be
          // recorded twice on the ledger. Rewrite api-origin URLs onto the
          // site's real domain before any tracking happens.
          try {
            const u = new URL(payUrl);
            if (u.host === req.get('host') && payWebsite.domain) {
              u.host = payWebsite.domain;
              payUrl = u.toString();
            }
          } catch { /* non-URL: keep as-is */ }
          const evtPayload = {
            resource: { id: req.body?.contentId || 'hub', title: title || 'content', type: req.body?.type || 'article', price: String(effectivePrice) },
            event: 'unlock_completed', url: payUrl, path: payPath,
            paymentProvider: gateway.payment.paymentProvider || 'circle-gateway', verified: true,
            amount: Number(effectivePrice), revenue: Number(effectivePrice), currency: 'USDC',
            payer: gateway.payment.payer || '', txHash: gateway.payment.txHash || '',
            // Key on the SETTLED tx first: downstream reporters (agents posting
            // unlock_completed after paying) echo the txHash they received, so
            // metric/receipt dedupe keys line up. The payment-signature header
            // is only a fallback for batched settles with no tx yet.
            paymentId: gateway.payment.txHash || gateway.payment.paymentId || '',
          };
          const tracked = await upsertTrackedContent(payWebsite, evtPayload).catch(() => null)
            || await db.content.findFirst({ where: { websiteId: payWebsite.id, url: payUrl } }).catch(() => null);
          if (tracked) {
            await createMetric(payWebsite, tracked, { ...evtPayload }, 'unlock_completed', 'unlock');
            await upsertUnlockReceipt(payWebsite, tracked, { ...evtPayload }, 'unlock_completed', { serverVerified: true });
          }
        }
      } catch (recordError) {
        console.error('[hub/pay] post-settlement recording failed:', recordError?.message || recordError);
      }

      res.json({ success: true, payment: { paymentProvider: gateway.payment.paymentProvider || 'circle-gateway', verified: true, paymentId: gateway.payment.paymentId || gateway.payment.txHash || null, recipient: gateway.payment.recipient, network: gateway.payment.network, amount: Number(price || 0), revenue: Number(price || 0), currency: 'USDC', payer: gateway.payment.payer || null, txHash: gateway.payment.txHash || null, ...overpayFields } });
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

      const rateCheck = checkTrackingRateLimit(siteId, req, extras.visitorId);
      if (!rateCheck.ok) return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: rateCheck.retryAfter });

      const eventName = cleanEventName(event);
      const metricType = eventTypeFor(event);
      let content = null;
      if (eventName !== 'page_view') {
        try {
          content = await upsertTrackedContent(website, { resource, event: eventName, url, path, ...extras, ...payload });
        } catch {
          // If upsert fails (e.g. unique constraint on websiteId+url), find existing content by URL
          if (url) {
            const existing = await db.content.findFirst({ where: { websiteId: website.id, url } });
            if (existing) content = existing;
          }
        }
      }

      if (metricType === 'content' && content) {
        await createMetric(website, content, { resource, event: eventName, ...extras, ...payload, url, path, headers: req.headers, ip: clientIpFor(req) }, eventName, 'content');
        await upsertPublisherIdentity(website, { resource, ...extras, ...payload });
      }
      if (['unlock', 'payment'].includes(metricType) && content) {
        const evtPayload = { resource, event: eventName, ...extras, ...payload, url, path, headers: req.headers, ip: clientIpFor(req) };
        // Idempotency backstop: verified paid events with NO usable payment id
        // can't dedupe via metricIdentity. If this wallet already has a
        // verified receipt for this content recently, the settlement was
        // already recorded server-side (/hub/pay) — drop the echo instead of
        // double-counting revenue.
        if (!paymentLikeId(payload)) {
          const payer = walletFromPayload(payload);
          const recent = payer ? await db.unlockReceipt.findFirst({
            where: {
              contentId: content.id,
              payerWallet: payer,
              status: 'verified',
              createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
            },
          }).catch(() => null) : null;
          if (recent) return res.json({ success: true, deduped: 'recent-receipt' });
        }
        await createMetric(website, content, evtPayload, eventName, metricType);
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
      // Cross-stack: adopt a timestamp-verified peer status so a site verified
      // on the other hub shows as verified here without a manual re-verify.
      const hydrated = [];
      for (const website of websites) {
        const withAdopt = await adoptCrossStackIfStale(website).catch(() => website);
        hydrated.push(serializeWebsite(withAdopt));
      }
      res.json({ success: true, websites: hydrated });
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

      const [websites, archivedCount] = await Promise.all([
        db.website.findMany({
          where: { ownerId: user.id, deletedAt: null },
          include: { content: { where: { deletedAt: null }, include: { metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } } }
        }),
        db.content.count({ where: { website: { ownerId: user.id, deletedAt: null }, deletedAt: { not: null } } })
      ]);
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
          archivedContent: archivedCount,
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
      const content = await findContentByIdOrExternal(req.params.contentId);
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
      const content = await findContentByIdOrExternal(contentId);
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
        contractAddress: process.env.NIBGATE_REPUTATION_CONTRACT || (activeNetwork().isTestnet ? '0x9f27fd62e75f86a3c7addfdba443aab1f930e281' : ''),
        chainId: process.env.NIBGATE_REPUTATION_CHAIN_ID || String(activeNetwork().chainId),
        chainName: process.env.NIBGATE_REPUTATION_CHAIN_NAME || activeNetwork().label,
        rpcUrl: process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || activeNetwork().reputationRpcUrl
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to prepare rating', details: error.message });
    }
  });

  // ── Reputation: Rating Stats (hub-authoritative read) ───────────────────
  // Single source of truth for a content's rating. Primary source is the
  // hub's indexed ratings (every accepted on-chain-proved rating is recorded
  // here) — immune to content-hash drift across domain renames, which
  // previously orphaned on-chain lookups (subblogs showed "No ratings yet"
  // while the hub held dozens). A live contract read is only the fallback
  // for ratings mined but not yet indexed. Satellite stacks (subblogs) must
  // use this instead of recomputing the content hash locally.
  app.get('/api/hub/reputation/ratings/stats', async (req, res) => {
    try {
      const content = await findContentByIdOrExternal(req.query?.contentId);
      if (!content) return res.status(404).json({ error: 'Content not found.' });

      const contentHash = contentHashFor(content.website, content);
      const agg = await db.contentRating.aggregate({
        where: { contentId: content.id, status: 'accepted', proof: { startsWith: 'onchain:' } },
        _count: { _all: true },
        _avg: { ratingValue: true },
      });
      let count = agg?._count?._all || 0;
      // ratingValue is stored in on-chain units (1–50); API scale is 1–5.
      let average = agg?._avg?.ratingValue ? Math.round((agg._avg.ratingValue / 10) * 10) / 10 : 0;

      if (count === 0) {
        const contractAddress = process.env.NIBGATE_REPUTATION_CONTRACT || (activeNetwork().isTestnet ? '0x9f27fd62e75f86a3c7addfdba443aab1f930e281' : '');
        const rpcUrl = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || activeNetwork().reputationRpcUrl;
        if (contractAddress && rpcUrl) {
          try {
            // SDK-owned contract read — the hub harnesses it, never reimplements it.
            const { readReputationStats } = await import('@nibgate/sdk/server');
            const live = await readReputationStats({ contentHash, contractAddress, rpcUrl, chainId: activeNetwork().chainId, chainName: activeNetwork().label });
            if (live.count > 0) { count = live.count; average = Math.round((live.total / live.count / 10) * 10) / 10; }
          } catch { /* live read is best-effort; indexed aggregate stands */ }
        }
      }

      res.json({ success: true, contentId: content.id, externalId: content.externalId || null, contentHash, average, count });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read rating stats', details: error.message });
    }
  });

  // ── Reputation: Index Onchain Rating ────────────────────────────────────

  app.post('/api/hub/reputation/ratings/index', async (req, res) => {
    try {
      const { contentId, txHash, walletAddress, contentHash, ratingValue, pageOrigin } = req.body || {};
      const content = await findContentByIdOrExternal(contentId);
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
        include: {
          content: { select: { id: true, title: true, externalId: true } },
          website: { select: { domain: true } }
        }
      });

      const byCurrency = {};
      for (const metric of metrics) {
        const curr = metric.currency || 'USDC';
        byCurrency[curr] = (byCurrency[curr] || 0) + (metric.revenue || 0);
      }

      const grossRevenue = metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
      // Fees recorded at ingest — pre-fee-model payments carry null/0, so never
      // recompute from amount (that would retroactively charge old flows).
      const rangeFeeAgg = await db.unlockReceipt
        .aggregate({ _sum: { protocolFee: true }, where: { websiteId: { in: websiteIds }, ...timeFilter } })
        .catch(() => ({ _sum: { protocolFee: 0 } }));
      const protocolFees = Number(rangeFeeAgg._sum.protocolFee || 0);
      const netRevenue = Math.max(0, +(grossRevenue - protocolFees).toFixed(6));

      const verifiedReceiptCount = receipts.filter((r) => r.status === 'verified' && ['circle-gateway', 'direct-transfer'].includes(r.paymentProvider)).length;
      res.json({
        success: true,
        summary: { revenue: grossRevenue, protocolFees, netRevenue, unlocks: verifiedReceiptCount, byCurrency, receiptCount: receipts.length },
        receipts: receipts.map((r) => ({
          id: r.id, contentId: r.contentId, contentTitle: r.content?.title || '', amount: r.amount, protocolFee: r.protocolFee, currency: r.currency || 'USDC',
          paymentProvider: r.paymentProvider, txHash: r.txHash, receiptUrl: r.receiptUrl, payerWallet: r.payerWallet, status: r.status, createdAt: r.createdAt
        })),
        earnings: {
          availableBalance: netRevenue,
          totalRevenue: grossRevenue,
          protocolFees,
          netRevenue,
          transactions: receipts.map((r) => ({
            id: r.id,
            amount: r.amount || 0,
            protocolFee: r.protocolFee ?? null,
            netAmount: r.amount == null ? null : Math.max(0, +((r.amount) - Number(r.protocolFee || 0)).toFixed(6)),
            contentTitle: r.content?.title || '',
            websiteName: r.website?.domain || '',
            createdAt: r.createdAt,
            txHash: r.txHash || undefined,
            paymentId: r.paymentId || undefined,
            paymentProvider: r.paymentProvider || undefined,
            receiptUrl: r.receiptUrl || undefined,
            payer: r.payerWallet || undefined,
            recipient: r.recipientWallet || undefined,
            network: r.network || undefined,
            status: r.status || undefined
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch earnings', details: error.message });
    }
  });

  // ── Sitemap: List Active Sites ──────────────────────────────────────────

  // Agent/site manifest (drop-in replacement for the legacy gateway): resolves
  // a verified website by subdomain (query ?subdomain=, x-site-subdomain /
  // x-forwarded-host / Host headers) and returns the nibgate.json shape the
  // subblog deploy proxies in subblogs/frontend nibgate.json/route.ts. Agents
  // discover content + pricing here before calling access/price endpoints.
  app.get('/api/nibgate/manifest', async (req, res) => {
    try {
      const fromQuery = String(req.query.subdomain || '').trim().toLowerCase();
      const host = String(req.headers['x-forwarded-host'] || req.headers['x-site-subdomain'] || req.headers.host || '').trim().toLowerCase();
      const raw = cleanDomain(fromQuery || host);
      if (!raw) return res.status(400).json({ error: 'Missing subdomain' });
      const siteHost = raw.includes('.') ? raw : `${raw}.nibgate.xyz`;

      const websites = await db.website.findMany({
        where: { deletedAt: null, isVerified: true, verificationStatus: 'verified' },
        include: { content: { where: { deletedAt: null }, include: { website: true } } }
      });
      const website = websites.find((w) => hostnameMatchesSite(siteHost, w.domain));
      if (!website) return res.status(404).json({ error: 'Site not found', subdomain: siteHost });

      const origin = originFor(website.domain).replace(/\/+$/, '');
      const pathFilter = String(req.query.path || '').trim();
      const content = website.content
        .filter((c) => !pathFilter || (c.path && c.path === pathFilter) || (c.url && c.url.endsWith(pathFilter)))
        .map((c) => {
          const access = Number(c.price) > 0 ? 'paid' : 'free';
          return {
            id: c.id,
            title: c.title,
            summary: c.description || '',
            type: c.contentType,
            price: String(c.price || '0'),
            currency: c.currency || 'USDC',
            path: c.path || '',
            url: c.url || `${origin}${c.path || ''}`,
            tags: cleanTags(c.tags),
            imageUrl: c.imageUrl || '',
            access: { humans: access, agents: access },
            unlock: { mode: 'one_time' }
          };
        });

      res.json({ name: website.name, origin, content });
    } catch (error) {
      res.status(500).json({ error: 'Failed to load site manifest', details: error.message });
    }
  });

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

  // ── Sitemap: All Content URLs across verified sites (up to Google's 50k limit) ──

  app.get('/api/hub/sitemap/content', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '50000', 10) || 50000, 1), 50000);
      const content = await db.content.findMany({
        where: { deletedAt: null, website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } },
        select: { url: true, lastSeenAt: true, createdAt: true },
        orderBy: { lastSeenAt: 'desc' },
        take: limit
      });
      res.json({ success: true, urls: content.map((c) => ({ url: c.url, updatedAt: c.lastSeenAt || c.createdAt })) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sitemap content' });
    }
  });

  // ── Reputation: Leaderboards ─────────────────────────────────────────────

  app.get('/api/hub/reputation/leaderboards', async (req, res) => {
    try {
      const type = String(req.query.type || 'creators').trim().toLowerCase();
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10) || 20, 1), 50);
      const skip = Math.max(Number.parseInt(req.query.skip || '0', 10) || 0, 0);

      if (type === 'content') {
        const verifiedWhere = { deletedAt: null, website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } };
        const [content, total] = await Promise.all([
          db.content.findMany({
            where: verifiedWhere,
            include: { website: { include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } } }, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
            take: 500
          }),
          db.content.count({ where: verifiedWhere })
        ]);
        const items = content.map(serializeContent)
          .sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views) || (b.revenue - a.revenue) || (new Date(b.createdAt) - new Date(a.createdAt)))
          .slice(skip, skip + limit)
          .map((content, index) => ({ rank: skip + index + 1, ...content }));
        return res.json({ success: true, type: 'content', items, total, limit, skip });
      }

      if (type === 'sites') {
        const [websites, siteTotal] = await Promise.all([
          db.website.findMany({
            where: { deletedAt: null, isVerified: true, verificationStatus: 'verified' },
            include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } }, content: { where: { deletedAt: null }, include: { website: true, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } }, _count: { select: { content: true, metrics: true, unlockReceipts: true, ratings: true } } },
            take: 500,
            orderBy: { createdAt: 'desc' }
          }),
          db.website.count({ where: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } })
        ]);
        const items = websites.map((website) => {
          const content = website.content.map(serializeContent);
          const score = siteReputationScore(content, website);
          return {
            id: website.id, name: website.name, domain: website.domain, description: website.description || '',
            faviconUrl: website.faviconUrl || `https://www.google.com/s2/favicons?domain=${website.domain}&sz=128`, ownerName: website.owner?.username || '',
            ownerWallet: primaryWalletAddress(website.owner || {}), reputationScore: score,
            contentCount: content.length, views: content.reduce((sum, item) => sum + item.views, 0),
            unlocks: content.reduce((sum, item) => sum + item.unlocks, 0),
            revenue: content.reduce((sum, item) => sum + item.revenue, 0),
            verificationStatus: website.verificationStatus || '', lastVerifiedAt: website.lastVerifiedAt || null
          };
        }).sort((a, b) => ((b.reputationScore || 0) - (a.reputationScore || 0)) || (b.unlocks - a.unlocks) || (b.views - a.views)).slice(skip, skip + limit).map((site, index) => ({ rank: skip + index + 1, ...site }));
        return res.json({ success: true, type: 'sites', items, total: siteTotal, limit, skip });
      }

      const [users, userTotal] = await Promise.all([
        db.user.findMany({
          include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }, websites: { where: { deletedAt: null, isVerified: true, verificationStatus: 'verified' }, include: { content: { where: { deletedAt: null }, include: { website: true, publisher: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } } } } } },
          take: 500,
          orderBy: { createdAt: 'asc' }
        }),
        db.user.count({ where: { wallets: { some: {} } } })
      ]);
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
        .slice(skip, skip + limit)
        .map((creator, index) => ({ rank: skip + index + 1, ...creator }));
      return res.json({ success: true, type: 'creators', items, total: userTotal, limit, skip });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch reputation leaderboards', details: error.message });
    }
  });

  // ── Platform Stats (real totals) ────────────────────────────────────────

  app.get('/api/hub/stats', async (req, res) => {
    try {
      const verifiedSiteWhere = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
      const [creatorCount, siteCount, contentCount, viewCount, unlockCount, revenueAgg] = await Promise.all([
        db.user.count({ where: { wallets: { some: {} }, websites: { some: verifiedSiteWhere } } }),
        db.website.count({ where: verifiedSiteWhere }),
        db.content.count({ where: { deletedAt: null, website: verifiedSiteWhere } }),
        db.metric.count({ where: { type: 'view', contentId: { not: null }, website: verifiedSiteWhere } }).catch(() => 0),
        db.unlockReceipt.count({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: verifiedSiteWhere } } }).catch(() => 0),
        db.unlockReceipt.findMany({ where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: verifiedSiteWhere } }, select: { amount: true } }).catch(() => [])
      ]);

      const views = Number(viewCount || 0);
      const unlocks = Number(unlockCount || 0);
      const revenue = (revenueAgg || []).reduce((total, receipt) => {
        const v = Number(receipt?.amount || 0);
        return v < 100 ? total + v : total;
      }, 0);
      // Sum the fee recorded at ingest time — do NOT recompute from amount,
      // since payments predating the fee wallet model carried no fee.
      const feeAgg = await db.unlockReceipt
        .aggregate({ _sum: { protocolFee: true }, where: { status: 'verified', paymentProvider: { in: ['circle-gateway', 'direct-transfer'] }, content: { website: verifiedSiteWhere } } })
        .catch(() => ({ _sum: { protocolFee: 0 } }));
      const protocolFees = Number(feeAgg._sum.protocolFee || 0);

      res.json({
        success: true,
        stats: { creators: creatorCount, sites: siteCount, content: contentCount, views, unlocks, revenue, protocolFees }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch platform stats', details: error.message });
    }
  });

  // ── Explore: Content Discovery ──────────────────────────────────────────

  app.get('/api/hub/explore/content', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const type = normalizeContentType(req.query.type || '');
      const requestedType = String(req.query.type || '').trim().toLowerCase();
      const sort = String(req.query.sort || 'trending').trim().toLowerCase();
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10) || 100, 1), 500);
      const skip = Math.max(Number.parseInt(req.query.skip || '0', 10) || 0, 0);

      const where = {
        deletedAt: null,
        website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' },
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
      const wallet = req.user.walletAddress || req.user.wallets?.[0]?.address || '';
      const linkToken = mintBlogLinkToken({ userId: req.user.id, wallet });
      res.json({ success: true, linkToken, expiresIn: 900, message: 'Paste this code in your blog admin settings to link your blog to your Nibgate hub account.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate linking code', details: error.message });
    }
  });

  app.post('/api/hub/blog/link/verify', async (req, res) => {
    try {
      const { linkToken, domain, name } = req.body || {};
      if (!linkToken || !domain) return res.status(400).json({ error: 'linkToken and domain are required.' });

      const payload = verifyBlogLinkToken(linkToken);
      if (!payload) return res.status(403).json({ error: 'Invalid link token.' });
      if (Date.now() > payload.expiresAt) return res.status(410).json({ error: 'Link token has expired. Generate a new one from your hub dashboard.' });

      // Owner resolution is wallet-first across stacks: same wallet = same
      // admin. A token minted on the other hub carries a foreign userId, so
      // fall back to the bound wallet (creating a stub identity the admin's
      // first wallet sign-in lands on).
      let user = payload.userId ? await db.user.findUnique({ where: { id: payload.userId } }) : null;
      if (!user && payload.wallet) user = await resolveUserByWallet(payload.wallet);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const clean = localCanonicalDomain(domain);
      const existing = await db.website.findFirst({ where: { domain: clean, deletedAt: null } });

      if (existing && existing.ownerId !== user.id) {
        return res.status(409).json({ error: 'Domain is already registered by another user.' });
      }

      const website = existing
        ? await db.website.update({
            where: { id: existing.id },
            data: { isVerified: true, verificationStatus: 'verified', verificationSource: 'owner-link', verificationFailureReason: null, deletedAt: null, ownerId: user.id }
          })
        : await db.website.create({
            data: { domain: clean, name: name?.trim() || clean, ownerId: user.id, isVerified: true, verificationStatus: 'verified', verificationSource: 'owner-link', siteToken: randomBytes(24).toString('hex'), verifyToken: hashValue(`${clean}:${user.id}:${Date.now()}:${Math.random()}`).slice(0, 32) },
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
