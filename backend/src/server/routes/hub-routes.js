import { db } from '@nibgate/internal/db.js';
import { requireAuth } from '@nibgate/internal/auth.js';
import { activeNetwork } from '@nibgate/internal/networks.js';
import { randomBytes } from 'node:crypto';
import { runHostedPayRequirement, preflightTransfer } from '@nibgate/sdk/server';
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
  normalizeNetworkName,
  mirrorPeerBlogPost,
  serializeContent, serializePublisherIdentity,
  siteReputationScore, creatorReputationScore, primaryWalletAddress,
  ratingAverage, acceptedRatingCount,
  TIP_MONEY_STATUSES, tipRevenueByContentId, attributeTips,
  nibshareStatsByWallet, platformMoneyTotals,
  publisherPayloadFor, upsertPublisherIdentity, contentDataFor,
  findContentByIdOrExternal, resolveTipContent
} from '../hub/helpers.js';
import { startVerificationMonitor, startManifestSyncMonitor, startReputationIndexer, startDataIntegrityMonitor, startGscSitemapMonitor, startGscIndexMonitor } from '../hub/monitors.js';
import { startFeeKeeper } from '../revenue/keeper.js';
import { startMetadataEnricher } from '../jev/metadata.js';

export function registerHubRoutes(app) {
  startVerificationMonitor();
  startManifestSyncMonitor();
  startReputationIndexer();
  startDataIntegrityMonitor();
  startGscSitemapMonitor();
  startGscIndexMonitor();
  // JEV tentative-metadata pass for content that has no tags. Opt-in.
  if (process.env.NIBGATE_DISABLE_KEEPER !== 'true') {
    startMetadataEnricher();
  }
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

  // Secret-gated link info for the trusted subblog fleet. A verified
  // nibgate-apex domain is already entitled, but the hub verifyToken is a
  // credential, so it is only handed to callers presenting the shared peer
  // secret (x-peer-secret === BLOG_LINK_SECRET). Lets an unlinked subblog
  // self-heal its hub linkage on load instead of a manual re-link.
  app.get('/api/hub/site/link-info', async (req, res) => {
    try {
      if (!checkPeerSecret(req)) return res.status(403).json({ error: 'Forbidden.' });
      const domain = cleanDomain(String(req.query?.domain || ''));
      if (!domain) return res.status(400).json({ error: 'domain is required.' });
      const website = await db.website.findFirst({
        where: { domain, deletedAt: null, isVerified: true, verificationStatus: 'verified' },
        include: { owner: { include: { wallets: true } } },
      });
      if (!website) return res.status(404).json({ success: false, error: 'not_verified', domain });
      const identity = await siteIdentityFor(website);
      res.json({
        success: true, domain: website.domain, siteId: website.id, verifyToken: website.verifyToken,
        name: website.name, ownerWallet: identity.ownerWallets?.[0] || null,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to resolve link info', details: error.message });
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
      const base = peerHubApiBase();
      let identities = [];
      if (all) {
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
      // Editorial blog posts (free, network-agnostic announcements) mirror
      // too — published only, author by wallet, newer-local-wins.
      const blogSynced = [];
      const blogSkipped = [];
      if (all) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const listResp = await fetch(`${base}/api/blog/posts`, { signal: controller.signal, headers: { accept: 'application/json' } });
          if (listResp?.ok) {
            const list = (await listResp.json()).posts || [];
            for (const item of list) {
              if (item.status !== 'published' || !item.slug) continue;
              try {
                const fullResp = await fetch(`${base}/api/blog/posts/${encodeURIComponent(item.slug)}`, { signal: controller.signal, headers: { accept: 'application/json' } });
                if (!fullResp?.ok) throw new Error(`HTTP ${fullResp?.status}`);
                const full = (await fullResp.json()).post;
                const row = await mirrorPeerBlogPost(full);
                if (row) blogSynced.push({ slug: item.slug });
                else blogSkipped.push({ slug: item.slug, reason: 'no author wallet or up to date' });
              } catch (error) {
                blogSkipped.push({ slug: item.slug, reason: error.message });
              }
            }
          }
        } catch (error) {
          blogSkipped.push({ slug: '*', reason: `blog index unreachable: ${error.message}` });
        } finally {
          clearTimeout(timer);
        }
      }
      res.json({ success: true, synced, skipped, blogPosts: { synced: blogSynced, skipped: blogSkipped } });
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
      const [totalViews, totalUnlocks, totalPayments, totalRatings, totalTips] = await Promise.all([
        db.metric.count({ where: { type: 'view', contentId: { not: null }, ...siteWhere } }),
        db.unlockReceipt.count({ where: verifiedUnlockWhere }),
        db.unlockReceipt.count({ where: verifiedUnlockWhere }),
        db.contentRating.count({ where: { status: 'accepted', proof: { startsWith: 'onchain:' }, ...siteWhere } }),
        // Tips count settled + released across ALL content — including
        // unverified sites and pages never indexed. Money happened; show it.
        db.tip.count({ where: { status: { in: ['settled', 'released'] }, ...(domain ? { contentUrl: { contains: domain } } : {}) } }),
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

      // 5. Recent tips (Tip — settled + released + refunded, any content indexed
      // or not). Refunded rows (negative amounts) net out refunded holds.
      // Deliberately NO website verification gate: a tip to an unverified
      // page is still real money with a real receipt. Domain filter matches
      // the raw contentUrl substring.
      if (!type || type === 'tips') {
        const tips = await db.tip.findMany({
          where: {
            status: { in: ['settled', 'released', 'refunded'] },
            ...(domain ? { OR: [{ contentUrl: { contains: domain } }, { domain }] } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        });
        // Reconcile every tip against the indexed Content row so the ledger
        // shows the same contentId/websiteId/domain/cover as views and unlocks.
        // This also repairs older rows written by clients that sent only a
        // relative path and no metadata: match by hub id, then URL, then path.
        const pathKeyFor = (value) => {
          const raw = String(value || '');
          if (!raw) return '';
          try { return new URL(raw).pathname; } catch { return raw.startsWith('/') ? raw : `/${raw}`; }
        };
        const ids = [...new Set(tips.map((t) => t.contentId).filter(Boolean))];
        const urls = [...new Set(tips.map((t) => t.contentUrl).filter((u) => /^https?:\/\//i.test(u)))];
        const paths = [...new Set(tips.map((t) => pathKeyFor(t.contentUrl)).filter(Boolean))];
        const [byId, byUrl, byPath] = await Promise.all([
          ids.length ? db.content.findMany({ where: { id: { in: ids } }, include: { website: true } }) : [],
          urls.length ? db.content.findMany({ where: { url: { in: urls } }, include: { website: true } }) : [],
          paths.length ? db.content.findMany({ where: { path: { in: paths } }, include: { website: true } }) : [],
        ]);
        const contentById = new Map(byId.map((c) => [c.id, c]));
        const contentByUrl = new Map(byUrl.map((c) => [c.url, c]));
        // Only trust a path match when one site owns it; a shared slug must not
        // mis-attribute a tip.
        const pathCounts = new Map();
        for (const c of byPath) pathCounts.set(c.path, (pathCounts.get(c.path) || 0) + 1);
        const contentByPath = new Map();
        for (const c of byPath) if (pathCounts.get(c.path) === 1) contentByPath.set(c.path, c);
        for (const t of tips) {
          const content = (t.contentId && contentById.get(t.contentId))
            || contentByUrl.get(t.contentUrl)
            || contentByPath.get(pathKeyFor(t.contentUrl))
            || null;
          const site = content?.website || null;
          const resolvedContentId = t.contentId || content?.id || null;
          const resolvedWebsiteId = t.websiteId || content?.websiteId || site?.id || null;
          // Prefer the stored domain (hold rows set it explicitly); fall back
          // to the indexed site, then to parsing contentUrl.
          let tipDomain = t.domain || site?.domain || '';
          if (!tipDomain) { try { tipDomain = new URL(t.contentUrl).hostname; } catch {} }
          activities.push({
            type: 'tip', id: t.id, websiteId: resolvedWebsiteId,
            actor: t.payerWallet || 'wallet',
            contentId: resolvedContentId,
            contentTitle: t.title || content?.title || t.contentUrl,
            contentUrl: content?.url || t.contentUrl,
            domain: tipDomain,
            imageUrl: t.imageUrl || content?.imageUrl || null,
            amount: t.amount || 0,
            protocolFee: t.protocolFee ?? null,
            feeBps: t.feeBps ?? null,
            currency: t.currency || 'USDC',
            timestamp: t.createdAt,
            // Verifiable tip fields
            paymentId: t.paymentId || null,
            txHash: t.txHash || null,
            network: t.network || null,
            paymentProvider: t.paymentProvider || null,
            payerWallet: t.payerWallet || null,
            recipientWallet: t.recipientWallet || null,
            payeeWallet: t.payeeWallet || null,
            status: t.status || 'settled',
          });
        }
      }

      // 6. Nibshare views + paid unlocks — privacy-safe by construction: entries
      // carry the share title, wallets, amounts, and tx hashes, but NEVER the
      // share link (no slug, share id, or url). Nibshares are private; the
      // ledger proves money moved without revealing where to read it. Draft
      // shares are excluded. No domain filter possible (shares have no domain),
      // so a domain-filtered query skips this section.
      let nibshareViews = 0, nibshareUnlocks = 0, nibshareRevenue = 0;
      if ((!type || type === 'nibshare') && !domain) {
        const [nibViewRows, nibReceiptRows] = await Promise.all([
          db.nibShareEvent.findMany({
            where: { type: 'view', share: { status: { not: 'draft' } } },
            include: { share: { select: { title: true, ownerWallet: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }).catch(() => []),
          db.nibShareReceipt.findMany({
            where: { amount: { gt: 0 }, share: { status: { not: 'draft' } } },
            include: { share: { select: { title: true, ownerWallet: true, currency: true } } },
            orderBy: { unlockedAt: 'desc' },
            take: limit,
            skip: offset,
          }).catch(() => []),
        ]);
        for (const v of nibViewRows) {
          activities.push({
            type: 'nibshare_view', id: v.id, source: 'nibshare',
            actor: v.wallet || 'anonymous',
            contentTitle: v.share?.title || 'Private share',
            domain: 'nibshare',
            ownerWallet: v.share?.ownerWallet || null,
            timestamp: v.createdAt,
          });
        }
        for (const r of nibReceiptRows) {
          activities.push({
            type: 'nibshare_unlock', id: r.id, source: 'nibshare',
            actor: r.payerWallet || 'wallet',
            contentTitle: r.share?.title || 'Private share',
            domain: 'nibshare',
            ownerWallet: r.share?.ownerWallet || null,
            amount: r.amount || 0,
            protocolFee: r.protocolFee ?? null,
            currency: r.share?.currency || 'USDC',
            timestamp: r.unlockedAt,
            txHash: r.txHash || null,
            payerWallet: r.payerWallet || null,
          });
        }
        const [nibViewCount, nibReceiptCount, nibRevenueRows] = await Promise.all([
          db.nibShareEvent.count({ where: { type: 'view', share: { status: { not: 'draft' } } } }).catch(() => 0),
          db.nibShareReceipt.count({ where: { amount: { gt: 0 }, share: { status: { not: 'draft' } } } }).catch(() => 0),
          db.nibShareReceipt.findMany({ where: { amount: { gt: 0 }, share: { status: { not: 'draft' } } }, select: { amount: true } }).catch(() => []),
        ]);
        nibshareViews = nibViewCount;
        nibshareUnlocks = nibReceiptCount;
        nibshareRevenue = nibRevenueRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      }

      // Sort all by timestamp desc, cap at limit
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const result = activities.slice(0, limit);

      res.json({
        success: true,
        activities: result,
        total: result.length,
        totals: { views: totalViews, unlocks: totalUnlocks, payments: totalPayments, ratings: totalRatings, tips: totalTips, nibshareViews, nibshareUnlocks, nibshareRevenue, total: totalViews + totalPayments + totalRatings + totalTips + nibshareViews + nibshareUnlocks },
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

  // Tips mutate money state (holds, claims, receipts) — same abuse class as
  // pay. Shared limiter across the tip surface.
  const hubTipLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { ok: false, error: 'Too many tip requests, slow down.' },
  });

  // JEV model calls hit a paid LLM — tighter budget than tips.
  const hubJevLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { ok: false, error: 'Too many JEV requests, slow down.' },
  });

  // Lazy JEV decisions client — the REAL JEV model (`~typesafe/jev-latest`
  // via /api/alpha/decisions), not a chat proxy. Modern Node imports the TS
  // directly; older runtimes fall back to 501 (callers keep deterministic flow).
  const jevDecider = async () => {
    try {
      return await import('../../../../jev/src/decisions.ts');
    } catch {
      return null;
    }
  };

  // ── Pre-broadcast preflight for the direct rail ──────────────────────────
  // The direct rail broadcasts an irreversible USDC transfer BEFORE the
  // ownership proof exists, so anything /hub/pay would reject is discovered
  // after the buyer's money has left their wallet. This endpoint re-runs the
  // verifier's acceptance criteria read-only (price, payTo, payer balance)
  // so the wallet can abort before asking for a transaction.
  //
  // Read-only and free: it creates no claim, no receipt, no entitlement, and
  // never moves funds. Safe to call on every "unlock" button press.
  const hubPreflightLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { ok: false, error: 'Too many preflight requests, slow down.', reason: 'preflight-rate-limited' },
  });

  app.post('/api/hub/preflight', hubPreflightLimiter, async (req, res) => {
    try {
      const { payer, amount, recipient, title, paymentRail } = req.body || {};
      const rail = paymentRail || req.body?.rail || 'transfer';

      // Free content needs no payment, so there is nothing to preflight.
      const contentRecord = await findContentByIdOrExternal(req.body?.contentId);
      if (contentRecord && Number(contentRecord.price || 0) <= 0) {
        return res.json({ ok: true, needed: false, reason: 'preflight-free-resource' });
      }
      if (rail !== 'transfer') {
        // Gateway (x402) already authorizes before settlement, so the ordering
        // problem this endpoint exists to solve does not apply to it.
        return res.json({ ok: true, needed: false, rail });
      }

      // Same untrusted-body rule as /hub/pay: server-side values win whenever
      // the contentId maps to a tracked record, so a caller cannot preflight a
      // price/recipient different from the one that would be verified.
      let effectivePrice = contentRecord?.price ? Number(contentRecord.price) : (amount ?? req.body?.price);
      let resolvedRecipient = contentRecord?.recipientWallet || recipient || process.env.NIBGATE_SELLER_ADDRESS || '';

      const result = await preflightTransfer(
        {
          id: req.body?.contentId || 'hub',
          title: title || 'content',
          price: String(effectivePrice ?? ''),
          recipient: resolvedRecipient,
          path: req.body?.path || '/',
        },
        { payer, amount: req.body?.amount, options: { hosted: true } }
      );

      if (!result.ok) {
        // 402 so clients can treat it like any other payment refusal, but the
        // body carries the machine `reason` that getPaymentErrorMessage maps.
        return res.status(402).json({
          ok: false,
          needed: true,
          error: 'Preflight rejected this payment',
          reason: result.reason,
          hint: result.hint,
          ...(Number.isFinite(result.balance) ? { balance: result.balance, amount: result.amount } : {}),
        });
      }

      return res.json({
        ok: true,
        needed: true,
        rail,
        // The wallet MUST broadcast to this exact payTo: it is what the
        // verifier will match the Transfer log against.
        payTo: result.payTo,
        amount: result.amount,
        currency: result.currency,
        network: result.network,
        balanceKnown: result.balanceKnown !== false,
      });
    } catch (error) {
      // Preflight is an optimization. If it errors we must not block a payment
      // that would otherwise succeed — tell the client to proceed.
      return res.status(200).json({
        ok: true,
        needed: false,
        proceedAnyway: true,
        reason: 'preflight-unavailable',
        detail: error?.message || String(error),
      });
    }
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

  // ── Tips (Nib Tip; LOCAL-ONLY until the Sep-30 freeze lifts — do not commit)
  // Challenge + verify harness the SDK tip module; revenue flows through the
  // unlock fee machinery (resolvePayTo → fee wallet, feePolicy). Tips are
  // recorded in Tip (never UnlockReceipt) so unlock counts stay clean.
  // tip.js is untracked pre-freeze, so load it lazily: images built from git
  // get a clean 501 instead of a boot crash. Never import it at top level.
  const tipServer = async () => {
    try {
      return await import('../../../../packages/nibgate/src/server/tip.js');
    } catch {
      return null;
    }
  };

  // Holding boxes: SDK helpers are untracked pre-freeze, so load lazily too.
  const holdingServer = async () => {
    try {
      return await import('../../../../packages/nibgate/src/server/holding.js');
    } catch {
      return null;
    }
  };

  // Keeper release: materialize the domain box and pay it out to the creator
  // (net) + treasury (cut) in one atomic tx. Returns the tx hash.
  const holdingKeeperKeys = () => ({
    privateKey: process.env.NIBGATE_KEEPER_PRIVATE_KEY || '',
    rpcUrl: process.env.ARC_RPC_URL || process.env.NIBGATE_PAYMENT_RPC_URL || '',
  });

  const releaseHoldingBox = async (domain, creator) => {
    const holding = await holdingServer();
    if (!holding) throw new Error('Holding SDK not available in this build.');
    const dep = holding.holdingDeployment(activeNetwork().name);
    const call = holding.buildHoldingRelease({ domain, creator, factoryAddress: dep.factoryAddress });
    const { privateKey, rpcUrl } = holdingKeeperKeys();
    if (!privateKey || !rpcUrl) throw new Error('Release requires NIBGATE_KEEPER_PRIVATE_KEY and an RPC URL.');
    return holding.submitHoldingRelease(call, { privateKey, rpcUrl, chainId: dep.chainId });
  };

  app.post('/api/hub/tips/challenge', hubTipLimiter, async (req, res) => {
    try {
      const tip = await tipServer();
      if (!tip) return res.status(501).json({ error: 'Tipping not enabled in this build.' });
      const { contentUrl, url, title, amount, currency, recipient, paymentRail, network } = req.body || {};
      const hubNet = activeNetwork();
      const out = await tip.createTipRequirement(
        { contentUrl: contentUrl || url, title, amount, currency, recipient },
        { network: hubNet.caip2, paymentRail },
      );
      res.json({ success: true, ...out.challenge, payee: out.payee, feeBps: out.feeBps, protocolFee: out.protocolFee });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/hub/tips/verify', hubTipLimiter, async (req, res) => {
    try {
      const tip = await tipServer();
      if (!tip) return res.status(501).json({ error: 'Tipping not enabled in this build.' });
      const { contentUrl, url, title, amount, currency, network, recipient, paymentRail, txHash, walletAddress, contentId, websiteId, imageUrl, domain } = req.body || {};
      const rail = String(paymentRail || 'transfer').toLowerCase();
      const hubNet = activeNetwork();
      const tipNetwork = normalizeNetworkName(network) || hubNet.name;
      const payNetwork = hubNet.caip2;
      const reqd = await tip.createTipRequirement(
        { contentUrl: contentUrl || url, title, amount, currency, recipient },
        { network: payNetwork, paymentRail: rail },
      );
      const verifier = tip.createTipVerifier({});
      let provider = 'direct-transfer';
      let paymentId = txHash || null;
      let receiptTxHash = txHash || null;
      let payer = walletAddress || null;
      if (rail === 'transfer' || rail === 'direct-transfer') {
        if (!txHash) return res.status(400).json({ error: 'txHash is required.' });
        const ok = await verifier.verifyDirect({
          resource: { price: String(amount) },
          txHash,
          payment: { recipient: reqd.payee, amount: Number(amount) },
        });
        if (!ok) return res.status(402).json({ ok: false, error: 'Tip transfer verification failed' });
      } else {
        // Browser clients send the gateway signature in the body; the
        // facilitator check reads the payment-signature header. Map it.
        req.headers['payment-signature'] = req.headers['payment-signature'] || req.body?.paymentSignature || req.body?.paymentId || '';
        const gw = await verifier.verifyGateway({
          req, resource: { contentUrl: contentUrl || url, title }, recipient: reqd.payee, amount, network: payNetwork,
        });
        if (gw.handled) {
          const status = gw.response?.status || 402;
          let body = null;
          try { body = JSON.parse(await gw.response.text()); } catch { body = { error: 'Payment required' }; }
          return res.status(status).json(body);
        }
        provider = 'circle-gateway';
        paymentId = gw.payment.paymentId || gw.payment.txHash || null;
        receiptTxHash = gw.payment.txHash || null;
        payer = gw.payment.payer || walletAddress || null;
      }
      // Attribute the tip to indexed content when possible. Clients may send
      // only a relative path; resolve it (or the given contentId/externalId)
      // so the row carries contentId/websiteId/domain/imageUrl like a view.
      const resolved = await resolveTipContent({
        contentId, contentUrl: contentUrl || url, websiteId,
      }).catch(() => null);
      const resolvedWebsite = resolved?.website || null;
      const storedUrl = resolved?.url || contentUrl || url || null;
      const storedContentId = resolved?.id || contentId || null;
      const storedWebsiteId = websiteId || resolved?.websiteId || resolvedWebsite?.id || null;
      const storedImageUrl = imageUrl || resolved?.imageUrl || null;
      let storedDomain = String(domain || '').trim();
      if (!storedDomain) { try { storedDomain = storedUrl ? new URL(storedUrl).hostname : ''; } catch { storedDomain = ''; } }
      if (!storedDomain) storedDomain = resolvedWebsite?.domain || '';
      const receipt = tip.tipReceipt({
        contentUrl: storedUrl || contentUrl || url, title, amount, currency, network: tipNetwork,
        payerWallet: payer, recipient, payee: reqd.payee,
        protocolFee: reqd.protocolFee, feeBps: reqd.feeBps, txHash: receiptTxHash,
      });
      const row = await db.tip.create({
        data: {
          contentUrl: storedUrl || contentUrl || url || null, contentId: storedContentId, websiteId: storedWebsiteId,
          domain: storedDomain || null,
          title: title || resolved?.title || null, imageUrl: storedImageUrl,
          amount: Number(amount), currency: currency || 'USDC', network: tipNetwork,
          payerWallet: payer, recipientWallet: recipient || null, payeeWallet: reqd.payee,
          protocolFee: reqd.protocolFee, feeBps: reqd.feeBps,
          paymentProvider: provider, paymentId, txHash: receiptTxHash, status: 'settled',
        },
      });
      res.json({ success: true, receipt, id: row.id });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/hub/tips', async (req, res) => {
    try {
      const where = {};
      if (req.query?.contentUrl) where.contentUrl = String(req.query.contentUrl);
      if (req.query?.status) where.status = String(req.query.status);
      const tips = await db.tip.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query?.limit || 50) || 50, 100) });
      res.json({ success: true, tips });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list tips', details: error.message });
    }
  });

  // Holding box (LOCAL-ONLY pre-freeze). Unresolved tips fund a no-key
  // per-domain box onchain; claim triggers factory.release() which pays the
  // creator net + treasury cut atomically. Two-step:
  //   POST without proof  → box-funding challenge (same x402 envelope)
  //   POST with proof      → verify into the box, record a held Tip
  app.post('/api/hub/tips/hold', hubTipLimiter, async (req, res) => {
    try {
      const holding = await holdingServer();
      const tip = await tipServer();
      if (!holding || !tip) return res.status(501).json({ error: 'Tipping not enabled in this build.' });
      const { contentUrl, url, title, amount, currency, domain, paymentRail, walletAddress, txHash, contentId, websiteId, imageUrl } = req.body || {};
      const target = String(contentUrl || url || '');
      if (!target) return res.status(400).json({ error: 'contentUrl is required.' });
      if (!(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be > 0.' });
      // Resolve indexed content first: it recovers the canonical URL, an
      // explicit domain, and contentId/websiteId/imageUrl from a client that
      // only sent a relative path.
      const resolved = await resolveTipContent({ contentId, contentUrl: target, websiteId }).catch(() => null);
      const resolvedWebsite = resolved?.website || null;
      const storedUrl = resolved?.url || target;
      const storedContentId = resolved?.id || contentId || null;
      const storedWebsiteId = websiteId || resolved?.websiteId || resolvedWebsite?.id || null;
      const storedImageUrl = imageUrl || resolved?.imageUrl || null;
      let dom = String(domain || '').trim();
      if (!dom) { try { dom = new URL(storedUrl).hostname; } catch { dom = ''; } }
      if (!dom) dom = resolvedWebsite?.domain || '';
      if (!dom) return res.status(400).json({ error: 'Could not determine domain; pass domain explicitly.' });
      const hubNet = activeNetwork();
      const reqd = holding.buildHoldingRequirement(
        { contentUrl: storedUrl, title: title || resolved?.title, amount, currency, domain: dom },
        { network: hubNet.name, paymentRail },
      );
      const rail = String(paymentRail || reqd.challenge.paymentRail || 'gateway').toLowerCase();
      const isTransfer = rail === 'transfer' || rail === 'direct-transfer';
      const gatewaySig = req.headers['payment-signature'] || req.body?.paymentSignature || req.body?.paymentId || '';
      const hasProof = isTransfer ? Boolean(txHash) : Boolean(gatewaySig);
      if (!hasProof) {
        return res.json({ success: true, holdStatus: 'challenge', domain: dom, box: reqd.box, feeBps: reqd.feeBps, ...reqd.challenge });
      }
      const verifier = tip.createTipVerifier({});
      let payer = walletAddress || null;
      let paymentId = txHash || null;
      let receiptTxHash = txHash || null;
      let provider = 'direct-transfer';
      if (isTransfer) {
        const ok = await verifier.verifyDirect({
          resource: { price: String(amount) },
          txHash,
          payment: { recipient: reqd.box, amount: Number(amount) },
        });
        if (!ok) return res.status(402).json({ ok: false, error: 'Hold transfer verification failed' });
      } else {
        provider = 'circle-gateway';
        req.headers['payment-signature'] = gatewaySig;
        const gw = await verifier.verifyGateway({
          req, resource: { contentUrl: target, title }, recipient: reqd.box, amount, network: hubNet.caip2,
        });
        if (gw.handled) {
          const status = gw.response?.status || 402;
          let body = null;
          try { body = JSON.parse(await gw.response.text()); } catch { body = { error: 'Payment required' }; }
          return res.status(status).json(body);
        }
        paymentId = gw.payment.paymentId || gw.payment.txHash || null;
        payer = gw.payment.payer || walletAddress || null;
        // No onchain funds yet: Circle credits the box's Gateway ledger. The
        // box's ERC-1271 withdrawal materializes it at claim time — no hub
        // custody, no shell address.
      }
      const row = await db.tip.create({
        data: {
          contentUrl: storedUrl, contentId: storedContentId, websiteId: storedWebsiteId,
          domain: dom, title: title || resolved?.title || null, imageUrl: storedImageUrl,
          amount: Number(amount), currency: currency || 'USDC',
          network: hubNet.name, payerWallet: payer,
          payeeWallet: reqd.box, status: 'held', holdReason: 'awaiting-claim',
          paymentProvider: provider, paymentId, txHash: receiptTxHash,
          feeBps: reqd.feeBps,
        },
      });
      res.json({ success: true, holdStatus: 'held', box: reqd.box, tip: row });
    } catch (error) {
      console.error(`[hub] POST /api/hub/tips/hold failed: ${error?.message || error}`);
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/hub/tips/held', async (req, res) => {
    try {
      const domain = String(req.query?.domain || '');
      if (!domain) return res.status(400).json({ error: 'domain is required.' });
      const tips = await db.tip.findMany({
        where: { status: 'held', OR: [{ domain }, { contentUrl: { contains: domain } }] },
        orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query?.limit || 50) || 50, 100),
      });
      const total = tips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      res.json({ success: true, tips, total });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list held tips', details: error.message });
    }
  });

  // Claim: verify site ownership, then keeper releases the domain box onchain
  // (net to creator, cut to treasury) and marks every held tip released.
  app.post('/api/hub/tips/claim', hubTipLimiter, async (req, res) => {
    try {
      const holding = await holdingServer();
      if (!holding) return res.status(501).json({ error: 'Tipping not enabled in this build.' });
      const { siteId, token, creatorWallet } = req.body || {};
      if (!siteId || !token) return res.status(400).json({ error: 'siteId and token required.' });
      const website = await db.website.findUnique({
        where: { id: siteId },
        include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } },
      });
      if (!website || website.verifyToken !== token) return res.status(403).json({ error: 'Invalid site credentials.' });
      const domain = holding.canonicalDomainKey(website.domain);
      const ownerWallet = website.owner?.wallets?.[0]?.address || website.owner?.walletAddress || null;
      // Two proofs: site ownership (verifyToken above) + wallet control.
      // Owner-link sites bind the owner wallet at sign-in, so the owner wallet
      // is implicitly controlled. Claiming to any *other* wallet requires a
      // signed claim token proving control of that wallet.
      let recipient = String(creatorWallet || ownerWallet || '').trim() || null;
      const claimToken = req.body?.claimToken || null;
      if (claimToken) {
        const check = await holding.verifyClaimToken({
          ...claimToken,
          domain,
          wallet: recipient || claimToken.wallet,
        });
        if (!check.valid) return res.status(403).json({ error: `Wallet control proof failed: ${check.reason}` });
        recipient = String(check.signer || claimToken.wallet || '').toLowerCase() || recipient;
      } else if (creatorWallet && String(creatorWallet).toLowerCase() !== String(ownerWallet || '').toLowerCase()) {
        return res.status(403).json({ error: 'Wallet control proof (claimToken) required to claim to a different wallet.' });
      }
      if (!recipient) return res.status(400).json({ error: 'No creator wallet to release to.' });
      // One verified wallet per domain. First claim binds it; a different
      // wallet later goes to manual review, never auto-release.
      const walletLc = recipient.toLowerCase();
      const priorClaim = await db.tipDomainClaim.findUnique({ where: { domain } });
      if (priorClaim && priorClaim.wallet.toLowerCase() !== walletLc) {
        return res.status(409).json({
          error: 'This domain was already claimed by another wallet; needs manual review.',
          code: 'domain-claimed-by-other-wallet',
        });
      }
      await db.tipDomainClaim.upsert({
        where: { domain },
        create: { domain, wallet: walletLc, network: activeNetwork().name },
        update: { wallet: walletLc },
      });
      const held = await db.tip.findMany({
        where: { status: 'held', OR: [{ domain }, { contentUrl: { contains: website.domain } }] },
        orderBy: { createdAt: 'asc' }, take: 100,
      });
      if (!held.length) return res.json({ success: true, released: [], pending: 0 });
      // Collect any Gateway-credited balance into the box first (the box's
      // ERC-1271 self-withdrawal), then release the box balance onchain.
      const { privateKey, rpcUrl } = holdingKeeperKeys();
      const hasGatewayHold = held.some((t) => t.paymentProvider === 'circle-gateway');
      if (privateKey && rpcUrl && hasGatewayHold) {
        try {
          // Circle batched settlement is deferred. If the box's credit is not
          // yet withdrawable, report settling instead of failing the claim.
          const gw = await holding.withdrawHoldingBoxGateway(domain, {
            privateKey, rpcUrl, network: activeNetwork().name, waitMs: 0,
          });
          if (gw?.withdrew === false || gw?.skipped) {
            return res.status(202).json({
              success: false, status: 'pending-settlement', domain,
              box: gw.box, available: gw.available,
              message: 'Circle Gateway is still settling this tip; retry the claim shortly.',
            });
          }
        } catch (gwError) {
          console.error(`[hub] claim gateway collection failed: ${gwError?.message || gwError}`);
          return res.status(502).json({ error: `Gateway collection failed: ${gwError.message}` });
        }
      }
      let releaseTx = null;
      try {
        releaseTx = await releaseHoldingBox(domain, recipient);
      } catch (releaseError) {
        return res.status(502).json({ error: `Onchain release failed: ${releaseError.message}` });
      }
      const dep = holding.holdingDeployment(activeNetwork().name);
      const amount = held.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const protocolFee = Math.round(amount * dep.feeBps) / 10000;
      await db.tip.updateMany({
        where: { id: { in: held.map((t) => t.id) } },
        data: {
          status: 'released', recipientWallet: recipient, payeeWallet: recipient,
          releaseTx, releasedAt: new Date(), holdReason: null,
          feeBps: dep.feeBps, protocolFee,
        },
      });
      const rows = await db.tip.findMany({ where: { id: { in: held.map((t) => t.id) } } });
      await db.tipDomainClaim.update({
        where: { domain },
        data: { releasedTips: { increment: held.length } },
      }).catch(() => {});
      res.json({
        success: true, domain, recipient, releaseTx, feeBps: dep.feeBps, protocolFee,
        released: rows, pending: 0,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Tips: Payer Refund (unclaimed holds only) ──────────────────────────
  // The payer proves wallet control by signature; the hub sums their unclaimed
  // (held, never released/claimed) tips for the domain and relays an on-chain
  // refund via the keeper. Full amount, no fee. Tip rows flip to 'refunded'
  // plus a negative refund row so the ledger nets out.
  app.post('/api/hub/tips/refund', hubTipLimiter, async (req, res) => {
    try {
      const holding = await holdingServer();
      if (!holding) return res.status(501).json({ error: 'Tipping not enabled in this build.' });
      const { domain, payer, amount, signature, message } = req.body || {};
      if (!domain || !payer || !signature || !message) {
        return res.status(400).json({ error: 'domain, payer, signature, message required.' });
      }
      const { recoverMessageAddress } = await import('viem');
      const signer = await recoverMessageAddress({ message, signature }).catch(() => null);
      if (!signer || String(signer).toLowerCase() !== String(payer).toLowerCase()) {
        return res.status(403).json({ error: 'Wallet control proof failed.' });
      }
      const canon = holding.canonicalDomainKey(domain);
      const held = await db.tip.findMany({
        where: {
          status: 'held',
          payerWallet: { equals: String(payer), mode: 'insensitive' },
          OR: [{ domain: canon }, { contentUrl: { contains: canon } }],
        },
        orderBy: { createdAt: 'asc' }, take: 200,
      });
      if (!held.length) return res.status(404).json({ error: 'No unclaimed held tips for this payer/domain.' });
      const total = held.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const refundAmount = amount != null ? Math.min(Number(amount), total) : total;
      if (!(refundAmount > 0)) return res.status(400).json({ error: 'Nothing to refund.' });
      const { privateKey, rpcUrl } = holdingKeeperKeys();
      if (!privateKey || !rpcUrl) return res.status(500).json({ error: 'Refund relay not configured (keeper key/RPC).' });
      const dep = holding.holdingDeployment(activeNetwork().name);
      const factoryAddress = process.env.TIP_HOLDING_FACTORY || dep.factoryAddress;
      const hasGatewayHold = held.some((t) => t.paymentProvider === 'circle-gateway');
      if (hasGatewayHold) {
        try {
          const gw = await holding.withdrawHoldingBoxGateway(canon, {
            privateKey, rpcUrl, network: activeNetwork().name, waitMs: 0, factoryAddress,
          });
          if (gw?.withdrew === false || gw?.skipped) {
            return res.status(202).json({
              success: false, status: 'pending-settlement', domain: canon,
              message: 'Circle Gateway is still settling this tip; retry the refund shortly.',
            });
          }
        } catch (gwError) {
          return res.status(502).json({ error: `Gateway collection failed: ${gwError.message}` });
        }
      }
      const call = holding.buildHoldingRefund({ domain: canon, payer, amountUsdc: refundAmount, factoryAddress });
      const refundTx = await holding.submitHoldingRefund(call, { privateKey, rpcUrl, chainId: dep.chainId });
      await db.tip.updateMany({
        where: { id: { in: held.map((t) => t.id) } },
        data: { status: 'refunded' },
      });
      const refundRow = await db.tip.create({
        data: {
          contentUrl: held[0].contentUrl, contentId: held[0].contentId, websiteId: held[0].websiteId,
          domain: canon, title: held[0].title, imageUrl: held[0].imageUrl, amount: -refundAmount, currency: held[0].currency || 'USDC',
          network: activeNetwork().name, payerWallet: String(payer).toLowerCase(),
          recipientWallet: String(payer).toLowerCase(), payeeWallet: String(payer).toLowerCase(),
          paymentProvider: 'refund', paymentId: refundTx, txHash: refundTx, status: 'refunded',
        },
      });
      res.json({ success: true, domain: canon, payer, amount: refundAmount, refundTx, id: refundRow.id });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── JEV decisions (the actual JEV model) ─────────────────────────────────
  // Ask `~typesafe/jev-latest` to choose ONE option over a described state.
  // Server-side only (key stays on the hub). Returns the model's pick +
  // calibrated confidence; the caller applies its own threshold before acting.
  app.post('/api/hub/jev/decide', hubJevLimiter, async (req, res) => {
    try {
      const jev = await jevDecider();
      if (!jev) return res.status(501).json({ error: 'JEV decisions not enabled in this build.' });
      const { state, instructions, candidates, questionId } = req.body || {};
      if (typeof state !== 'string' || !state.trim() || state.length > 4000) {
        return res.status(400).json({ error: 'state (1-4000 chars) is required.' });
      }
      if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 500) {
        return res.status(400).json({ error: 'instructions (1-500 chars) is required.' });
      }
      if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 12) {
        return res.status(400).json({ error: 'candidates (2-12) are required.' });
      }
      for (const c of candidates) {
        if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 200 ||
            typeof c.context !== 'string' || !c.context || c.context.length > 2000) {
          return res.status(400).json({ error: 'Each candidate needs {id, context} within size limits.' });
        }
      }
      if (questionId != null && (typeof questionId !== 'string' || !questionId || questionId.length > 40)) {
        return res.status(400).json({ error: 'questionId must be a short string.' });
      }
      const chosen = await jev.chooseOption({
        state: state.trim(),
        instructions: instructions.trim(),
        questionId: questionId || 'choice',
        options: candidates.map((c) => ({ id: c.id, description: c.context })),
      });
      if (!chosen) return res.status(502).json({ error: 'No usable decision returned.' });
      res.json({ success: true, ...chosen });
    } catch (error) {
      res.status(502).json({ error: `Decide failed: ${error.message}` });
    }
  });

  // ── JEV classify (noul probability: is this creator content?) ────────────
  // The deterministic page model handles the clear cases; the extension calls
  // this ONLY when its own judgment is low-confidence. Returns a calibrated
  // 0..1 probability the caller thresholds (it must not act on a coin flip).
  app.post('/api/hub/jev/classify', hubJevLimiter, async (req, res) => {
    try {
      const jev = await jevDecider();
      if (!jev) return res.status(501).json({ error: 'JEV decisions not enabled in this build.' });
      const { state, instructions } = req.body || {};
      if (typeof state !== 'string' || !state.trim() || state.length > 4000) {
        return res.status(400).json({ error: 'state (1-4000 chars) is required.' });
      }
      if (instructions != null && (typeof instructions !== 'string' || instructions.length > 500)) {
        return res.status(400).json({ error: 'instructions must be a short string.' });
      }
      const out = await jev.askNoul({
        state: state.trim(),
        questionId: 'isContent',
        instructions:
          instructions ||
          'Probability (0..1) that this is a single creator-authored content page (an article, story, post, or media piece) that a reader could tip — not a landing page, feed, listing, app, auth, or shopping page.',
      });
      if (!out) return res.status(502).json({ error: 'No usable judgment returned.' });
      res.json({ success: true, probability: out.probability, model: out.model, usage: out.usage || null });
    } catch (error) {
      res.status(502).json({ error: `Classify failed: ${error.message}` });
    }
  });

  // ── JEV grade (score primitive: ordered-scale placement) ─────────────────
  // Where Choice picks and Noul gives P(yes), Score places input on an
  // ordered scale the caller defines (e.g. evidence quality tiers) and
  // returns the probability-weighted position plus per-level probabilities.
  // Used for grading, never gating: a low grade reorders, it doesn't refuse.
  app.post('/api/hub/jev/score', hubJevLimiter, async (req, res) => {
    try {
      const jev = await jevDecider();
      if (!jev) return res.status(501).json({ error: 'JEV decisions not enabled in this build.' });
      if (typeof jev.askScore !== 'function') return res.status(501).json({ error: 'JEV score not enabled in this build.' });
      const { state, instructions, levels, questionId } = req.body || {};
      if (typeof state !== 'string' || !state.trim() || state.length > 4000) {
        return res.status(400).json({ error: 'state (1-4000 chars) is required.' });
      }
      if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > 500) {
        return res.status(400).json({ error: 'instructions (1-500 chars) are required.' });
      }
      if (!Array.isArray(levels) || levels.length < 2 || levels.length > 6) {
        return res.status(400).json({ error: 'levels (2-6 ordered criteria) are required.' });
      }
      for (const l of levels) {
        if (typeof l !== 'string' || !l.trim() || l.length > 200) {
          return res.status(400).json({ error: 'Each level must be a short string.' });
        }
      }
      if (questionId != null && (typeof questionId !== 'string' || !questionId || questionId.length > 40)) {
        return res.status(400).json({ error: 'questionId must be a short string.' });
      }
      const out = await jev.askScore({ state: state.trim(), instructions: instructions.trim(), levels, questionId: questionId || 'grade' });
      if (!out) return res.status(502).json({ error: 'No usable grade returned.' });
      res.json({ success: true, score: out.score, confidence: out.confidence, probabilities: out.probabilities, model: out.model, usage: out.usage || null });
    } catch (error) {
      res.status(502).json({ error: `Score failed: ${error.message}` });
    }
  });

  // ── JEV tags (batch noul over candidate tags) ────────────────────────────
  // Tentative metadata for thin content: score a bounded candidate tag set in
  // ONE request and return the confident top-k. Callers decide whether to
  // persist the result as tentative.
  app.post('/api/hub/jev/tags', hubJevLimiter, async (req, res) => {
    try {
      const jev = await jevDecider();
      if (!jev) return res.status(501).json({ error: 'JEV decisions not enabled in this build.' });
      const { state, candidates, topK, minProbability } = req.body || {};
      if (typeof state !== 'string' || !state.trim() || state.length > 4000) {
        return res.status(400).json({ error: 'state (1-4000 chars) is required.' });
      }
      if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 24) {
        return res.status(400).json({ error: 'candidates (2-24 tags) are required.' });
      }
      const tags = [];
      for (const c of candidates) {
        if (typeof c !== 'string' || !c.trim() || c.length > 60) {
          return res.status(400).json({ error: 'Each candidate must be a short tag string.' });
        }
        tags.push(c.trim());
      }
      const k = topK == null ? 3 : Number(topK);
      if (!Number.isInteger(k) || k < 1 || k > 10) return res.status(400).json({ error: 'topK must be 1-10.' });
      const minP = minProbability == null ? 0 : Number(minProbability);
      if (!(minP >= 0 && minP <= 1)) return res.status(400).json({ error: 'minProbability must be 0-1.' });
      const out = await jev.askNoulBatch({
        state: state.trim(),
        questions: tags.map((tag, i) => ({ id: `t${i}`, instructions: `Probability (0..1) that the tag "${tag}" accurately describes this content.` })),
      });
      if (!out) return res.status(502).json({ error: 'No usable tags returned.' });
      const scored = tags
        .map((tag, i) => ({ tag, probability: out.answers[`t${i}`] ?? 0 }))
        .filter((t) => t.probability >= minP)
        .sort((a, b) => b.probability - a.probability);
      res.json({ success: true, tags: scored.slice(0, k), model: out.model, usage: out.usage || null });
    } catch (error) {
      res.status(502).json({ error: `Tags failed: ${error.message}` });
    }
  });

  // ── JEV batch (mixed choice + noul judgments in ONE request) ─────────────
  // One model round trip for a batch of independent judgments — e.g. grading
  // several candidate questions plus the global brief state, or scoring a set
  // of sources. Callers still own every threshold; the response carries
  // per-question answers plus the model and usage for the audit trail.
  app.post('/api/hub/jev/batch', hubJevLimiter, async (req, res) => {
    try {
      const jev = await jevDecider();
      if (!jev) return res.status(501).json({ error: 'JEV decisions not enabled in this build.' });
      const { state, questions } = req.body || {};
      if (typeof state !== 'string' || !state.trim() || state.length > 4000) {
        return res.status(400).json({ error: 'state (1-4000 chars) is required.' });
      }
      if (!Array.isArray(questions) || questions.length < 1 || questions.length > 12) {
        return res.status(400).json({ error: 'questions (1-12) are required.' });
      }
      const seen = new Set();
      const record = {};
      for (const q of questions) {
        if (!q || typeof q.id !== 'string' || !q.id || q.id.length > 40 || seen.has(q.id)) {
          return res.status(400).json({ error: 'Each question needs a unique short id.' });
        }
        seen.add(q.id);
        if (typeof q.instructions !== 'string' || !q.instructions.trim() || q.instructions.length > 500) {
          return res.status(400).json({ error: `Question ${q.id} needs instructions (1-500 chars).` });
        }
        if (q.type === 'choice') {
          if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) {
            return res.status(400).json({ error: `Choice question ${q.id} needs 2-8 options.` });
          }
          const criteria = {};
          for (const o of q.options) {
            if (!o || typeof o.id !== 'string' || !o.id || o.id.length > 60 ||
                typeof o.description !== 'string' || !o.description || o.description.length > 500) {
              return res.status(400).json({ error: `Question ${q.id} options need {id, description} within size limits.` });
            }
            criteria[o.id] = o.description;
          }
          record[q.id] = { type: 'choice', instructions: q.instructions.trim(), criteria };
        } else if (q.type === 'noul') {
          record[q.id] = { type: 'noul', instructions: q.instructions.trim() };
        } else {
          return res.status(400).json({ error: `Question ${q.id} must be type choice or noul.` });
        }
      }
      const out = await jev.decisions({ state: state.trim(), questions: record });
      const answers = {};
      for (const q of questions) {
        const a = out.answers?.[q.id];
        if (q.type === 'choice') {
          const choice = typeof a?.choice === 'string' ? a.choice : null;
          const options = (q.options || []).map((o) => o.id);
          const probabilities = {};
          for (const id of options) {
            const p = Number(a?.probabilities?.[id]);
            probabilities[id] = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
          }
          answers[q.id] = {
            type: 'choice',
            choice: choice && options.includes(choice) ? choice : null,
            probabilities,
            confidence: Number.isFinite(Number(a?.confidence)) ? Number(a.confidence) : 0,
          };
        } else {
          const p = Number(a?.noul);
          answers[q.id] = { type: 'noul', probability: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0 };
        }
      }
      res.json({ success: true, answers, model: out.model, usage: out.usage || null });
    } catch (error) {
      res.status(502).json({ error: `Batch failed: ${error.message}` });
    }
  });

  app.get('/api/hub/resolve', async (req, res) => {
    try {
      const url = String(req.query?.url || '');
      const content = url ? await db.content.findFirst({ where: { url } }) : null;
      if (content?.recipientWallet) {
        return res.json({ success: true, wallet: content.recipientWallet, confidence: 0.9, source: 'hub-index' });
      }
      // Domain-level fallback: a verified site's owner receives for the whole
      // domain (per-article recipientWallet above still wins when present).
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = ''; }
      if (host) {
        const site = await db.website.findFirst({
          where: { domain: host, deletedAt: null, isVerified: true },
          include: { owner: { include: { wallets: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } } },
        });
        const wallet = site?.owner?.wallets?.[0]?.address || site?.owner?.walletAddress || null;
        if (wallet) return res.json({ success: true, wallet, confidence: 0.8, source: 'hub-index-domain' });
      }
      return res.json({ success: false, state: 'unresolved', reason: 'no verified recipient' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to resolve recipient', details: error.message });
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
        const tipByContent = await tipRevenueByContentId(content.map((c) => c.id));
        const items = content.map(serializeContent).map((c) => ({
          ...c,
          tipRevenue: tipByContent.get(c.id) || 0,
          revenue: c.revenue + (tipByContent.get(c.id) || 0),
        }))
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
        const contentToSite = new Map();
        const siteToOwner = new Map();
        const domainToSite = new Map();
        for (const w of websites) {
          siteToOwner.set(w.id, w.ownerId || null);
          if (w.domain) domainToSite.set(String(w.domain).toLowerCase(), w.id);
          for (const c of w.content || []) contentToSite.set(c.id, w.id);
        }
        const siteTips = await attributeTips({ contentToSite, siteToOwner, domainToSite });
        const items = websites.map((website) => {
          const content = website.content.map(serializeContent);
          const score = siteReputationScore(content, website);
          const tipRevenue = siteTips.bySite.get(website.id) || 0;
          return {
            id: website.id, name: website.name, domain: website.domain, description: website.description || '',
            faviconUrl: website.faviconUrl || `https://www.google.com/s2/favicons?domain=${website.domain}&sz=128`, ownerName: website.owner?.username || '',
            ownerWallet: primaryWalletAddress(website.owner || {}), reputationScore: score,
            contentCount: content.length, views: content.reduce((sum, item) => sum + item.views, 0),
            unlocks: content.reduce((sum, item) => sum + item.unlocks, 0),
            revenue: content.reduce((sum, item) => sum + item.revenue, 0) + tipRevenue,
            tipRevenue,
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
      const contentToOwner = new Map();
      const siteToOwner = new Map();
      const domainToSite = new Map();
      const allWallets = [];
      for (const u of users) {
        for (const w of u.websites || []) {
          siteToOwner.set(w.id, u.id);
          if (w.domain) domainToSite.set(String(w.domain).toLowerCase(), w.id);
          for (const c of w.content || []) contentToOwner.set(c.id, w.id);
        }
        for (const wl of u.wallets || []) {
          if (wl.address) allWallets.push(wl.address);
        }
      }
      const [creatorTips, creatorNib] = await Promise.all([
        attributeTips({ contentToSite: contentToOwner, siteToOwner, domainToSite }),
        nibshareStatsByWallet(allWallets),
      ]);
      const nibFor = (user) => {
        const agg = { revenue: 0, unlocks: 0, views: 0 };
        for (const wl of user.wallets || []) {
          const s = creatorNib.get(String(wl.address || '').toLowerCase());
          if (s) { agg.revenue += s.revenue; agg.unlocks += s.unlocks; agg.views += s.views; }
        }
        return agg;
      };
      const items = users.map((user) => {
        const websites = user.websites || [];
        const content = websites.flatMap((website) => website.content.map(serializeContent));
        const score = creatorReputationScore(content, websites);
        const tipRevenue = creatorTips.byOwner.get(user.id) || 0;
        const nib = nibFor(user);
        return {
          id: user.id, name: user.username || 'Unnamed creator',
          walletAddress: primaryWalletAddress(user), avatarUrl: user.avatarUrl || '', bio: user.bio || '',
          reputationScore: score, verifiedSites: websites.filter((w) => w.isVerified && w.verificationStatus === 'verified').length,
          siteCount: websites.length, contentCount: content.length, views: content.reduce((s, c) => s + c.views, 0),
          unlocks: content.reduce((s, c) => s + c.unlocks, 0),
          revenue: content.reduce((s, c) => s + c.revenue, 0) + tipRevenue + nib.revenue,
          tipRevenue, nibshareRevenue: nib.revenue, nibshareUnlocks: nib.unlocks, nibshareViews: nib.views,
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

      // Tips and nibshares are creator money too — fold them into revenue.
      // Historical rows count (no date filter), so old tips/shares land here
      // retroactively the moment this ships.
      const money = await platformMoneyTotals();

      res.json({
        success: true,
        stats: {
          creators: creatorCount, sites: siteCount, content: contentCount, views, unlocks,
          revenue: revenue + money.tipRevenue + money.nibshareRevenue,
          protocolFees: protocolFees + money.tipFees + money.nibshareFees,
          tips: money.tips, tipRevenue: money.tipRevenue,
          nibshareUnlocks: money.nibshareUnlocks, nibshareViews: money.nibshareViews,
          nibshareRevenue: money.nibshareRevenue,
        }
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

      const [allContent, total] = await Promise.all([
        db.content.findMany({
          where,
          include: { website: true, metrics: true, ratings: true, unlockReceipts: true, _count: { select: { metrics: true, unlockReceipts: true, ratings: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        db.content.count({ where })
      ]);

      const serialized = allContent.map(serializeContent);
      const sorted = serialized.sort((a, b) => {
        const va = a.websiteVerified ? 1 : 0;
        const vb = b.websiteVerified ? 1 : 0;
        const imgA = a.imageUrl ? 1 : 0;
        const imgB = b.imageUrl ? 1 : 0;
        if (sort === 'best-sellers') return (vb - va) || (imgB - imgA) || (b.unlocks - a.unlocks) || (b.revenue - a.revenue) || (b.views - a.views);
        if (sort === 'hot-new') return (vb - va) || (imgB - imgA) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return (vb - va) || (imgB - imgA) || (b.views + b.unlocks * 4 + b.revenue * 20) - (a.views + a.unlocks * 4 + a.revenue * 20);
      });

      const content = sorted.slice(skip, skip + limit);
      res.json({ success: true, content, total, limit, skip });
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
