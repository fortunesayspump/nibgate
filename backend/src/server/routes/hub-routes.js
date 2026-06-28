import { db } from 'nibgate/src/core/db.js';
import { getUserBySession } from 'nibgate/src/core/auth.js';
import crypto from 'node:crypto';

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
  return String(domain).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function serializeContent(content) {
  return {
    id: content.id,
    websiteId: content.websiteId,
    websiteName: content.website?.name || '',
    websiteDomain: content.website?.domain || '',
    title: content.title,
    description: content.description || '',
    imageUrl: content.imageUrl || '',
    contentType: content.contentType,
    tags: content.tags || '',
    url: content.url,
    price: content.price,
    createdAt: content.createdAt,
    metrics: content._count?.metrics || 0
  };
}

export function registerHubRoutes(app) {
  
  // 1. Dashboard: Register a new Website
  async function registerWebsite(req, res) {
    try {
      const { domain, name, description } = req.body;
      if (!domain || !name) {
        return res.status(400).json({ error: 'Domain and Name are required' });
      }

      // Generate verification tokens
      const verifyToken = crypto.randomBytes(16).toString('hex');
      const siteToken = crypto.randomBytes(24).toString('hex');

      const website = await db.website.create({
        data: {
          domain: cleanDomain(domain),
          name,
          description,
          ownerId: req.user.id,
          verifyToken,
          siteToken,
          isVerified: false
        }
      });

      res.json({ success: true, website });
    } catch (error) {
      if (error.code === 'P2002') {
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
        where: { id: websiteId, ownerId: req.user.id }
      });

      if (!website) {
        return res.status(404).json({ error: 'Website not found' });
      }

      // Check the .well-known/nibgate-verify.txt file
      const verificationUrl = `https://${website.domain}/.well-known/nibgate-verify.txt`;
      
      try {
        const response = await fetch(verificationUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Could not fetch verification file from the domain' });
        }
        
        const text = await response.text();
        if (text.trim() === website.verifyToken) {
          
          // --- BEGIN METADATA EXTRACTION ---
          let ogImageUrl = null;
          let description = website.description;
          try {
            const homeRes = await fetch(`https://${website.domain}`);
            const html = await homeRes.text();
            
            // Extract OG Image
            const ogMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
            if (ogMatch && ogMatch[1]) {
               ogImageUrl = ogMatch[1].startsWith('/') ? `https://${website.domain}${ogMatch[1]}` : ogMatch[1];
            }
            
            // Extract Meta Description if missing
            if (!description) {
               const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
               if (descMatch && descMatch[1]) description = descMatch[1];
            }
          } catch(e) {
            console.log('Failed to scrape metadata:', e.message);
          }
          
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${website.domain}&sz=128`;
          // --- END METADATA EXTRACTION ---

          await db.website.update({
            where: { id: website.id },
            data: { 
              isVerified: true,
              faviconUrl,
              ogImageUrl,
              description
            }
          });
          return res.json({ success: true, verified: true });
        } else {
          return res.status(400).json({ error: 'Token mismatch. Expected ' + website.verifyToken });
        }
      } catch (err) {
        // Fallback for local development testing (http instead of https)
        if (website.domain.includes('localhost')) {
            const localResponse = await fetch(`http://${website.domain}/.well-known/nibgate-verify.txt`);
            const localText = await localResponse.text();
            if (localText.trim() === website.verifyToken) {
                await db.website.update({ where: { id: website.id }, data: { isVerified: true }});
                return res.json({ success: true, verified: true });
            }
        }
        return res.status(400).json({ error: 'Network error connecting to domain' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Verification process failed' });
    }
  }

  app.post('/api/hub/site/verify', requireAuth, verifyWebsite);
  app.post('/api/hub/sites/:websiteId/verify', requireAuth, verifyWebsite);

  // 3. API: Sync Content Manifest (Authenticated via siteToken)
  app.post('/api/hub/sync', async (req, res) => {
    try {
      // Expecting standard Bearer token
      const authHeader = req.headers.authorization || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.*)$/);
      const siteToken = tokenMatch ? tokenMatch[1] : null;

      if (!siteToken) {
        return res.status(401).json({ error: 'Missing siteToken in Authorization header' });
      }

      const website = await db.website.findFirst({
        where: { siteToken }
      });

      if (!website) {
        return res.status(401).json({ error: 'Invalid siteToken' });
      }
      if (!website.isVerified) {
        return res.status(403).json({ error: 'Website must be verified before syncing content' });
      }

      const { resources } = req.body;
      if (!Array.isArray(resources)) {
        return res.status(400).json({ error: 'Payload must contain a "resources" array' });
      }

      // Upsert the content
      let syncedCount = 0;
      for (const item of resources) {
        if (!item.url || !item.title) continue;

        const contentId = crypto.createHash('md5').update(website.id + item.url).digest('hex');

        await db.content.upsert({
          where: { id: contentId },
          update: {
            title: item.title,
            description: item.description || null,
            imageUrl: item.imageUrl || null,
            contentType: item.contentType || 'image',
            tags: item.tags || null,
            price: parseFloat(item.price) || 0.01,
          },
          create: {
            id: contentId,
            websiteId: website.id,
            title: item.title,
            description: item.description || null,
            imageUrl: item.imageUrl || null,
            contentType: item.contentType || 'image',
            tags: item.tags || null,
            url: item.url,
            price: parseFloat(item.price) || 0.01,
          }
        });
        syncedCount++;
      }

      res.json({ success: true, syncedCount });
    } catch (error) {
      res.status(500).json({ error: 'Sync failed', details: error.message });
    }
  });
  
  // 4. API: Dashboard Websites List
  app.get('/api/hub/sites', requireAuth, async (req, res) => {
    try {
      const websites = await db.website.findMany({
        where: { ownerId: req.user.id },
        include: { _count: { select: { content: true } } }
      });
      res.json({ success: true, websites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch websites' });
    }
  });

  app.get('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    res.json({
      success: true,
      profile: {
        id: req.user.id,
        walletAddress: req.user.walletAddress,
        username: req.user.username || '',
        avatarUrl: req.user.avatarUrl || '',
        createdAt: req.user.createdAt
      }
    });
  });

  app.put('/api/hub/dashboard/profile', requireAuth, async (req, res) => {
    try {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const avatarUrl = typeof req.body.avatarUrl === 'string' ? req.body.avatarUrl.trim() : '';

      const user = await db.user.update({
        where: { id: req.user.id },
        data: {
          username: username || null,
          avatarUrl: avatarUrl || null
        }
      });

      res.json({
        success: true,
        profile: {
          id: user.id,
          walletAddress: user.walletAddress,
          username: user.username || '',
          avatarUrl: user.avatarUrl || '',
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.get('/api/hub/dashboard/content', requireAuth, async (req, res) => {
    try {
      const content = await db.content.findMany({
        where: {
          website: { ownerId: req.user.id }
        },
        include: {
          website: true,
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
        where: { ownerId: req.user.id },
        select: { id: true }
      });
      const websiteIds = websites.map((website) => website.id);

      if (websiteIds.length === 0) {
        return res.json({
          success: true,
          analytics: {
            totalViews: 0,
            totalUnlocks: 0,
            unlockRate: 0,
            totalRevenue: 0,
            recentEvents: []
          }
        });
      }

      const [totalViews, totalUnlocks, revenueAggregate, recentEvents] = await Promise.all([
        db.metric.count({ where: { websiteId: { in: websiteIds }, type: 'view' } }),
        db.metric.count({ where: { websiteId: { in: websiteIds }, type: 'unlock' } }),
        db.metric.aggregate({
          where: { websiteId: { in: websiteIds }, type: 'unlock' },
          _sum: { revenue: true }
        }),
        db.metric.findMany({
          where: { websiteId: { in: websiteIds } },
          include: {
            website: true,
            content: true
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        })
      ]);

      res.json({
        success: true,
        analytics: {
          totalViews,
          totalUnlocks,
          unlockRate: totalViews > 0 ? totalUnlocks / totalViews : 0,
          totalRevenue: revenueAggregate._sum.revenue || 0,
          recentEvents: recentEvents.map((event) => ({
            id: event.id,
            type: event.type,
            revenue: event.revenue || 0,
            websiteName: event.website?.name || '',
            contentTitle: event.content?.title || '',
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
        where: { ownerId: req.user.id },
        select: { id: true }
      });
      const websiteIds = websites.map((website) => website.id);

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

      const [revenueAggregate, transactions] = await Promise.all([
        db.metric.aggregate({
          where: { websiteId: { in: websiteIds }, type: 'unlock' },
          _sum: { revenue: true }
        }),
        db.metric.findMany({
          where: { websiteId: { in: websiteIds }, type: 'unlock' },
          include: {
            website: true,
            content: true
          },
          orderBy: { createdAt: 'desc' },
          take: 25
        })
      ]);

      const totalRevenue = revenueAggregate._sum.revenue || 0;

      res.json({
        success: true,
        earnings: {
          availableBalance: totalRevenue,
          totalRevenue,
          transactions: transactions.map((transaction) => ({
            id: transaction.id,
            amount: transaction.revenue || 0,
            contentTitle: transaction.content?.title || '',
            websiteName: transaction.website?.name || '',
            createdAt: transaction.createdAt
          }))
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch earnings' });
    }
  });

  app.get('/api/hub/explore/content', async (_req, res) => {
    try {
      const content = await db.content.findMany({
        where: {
          website: { isVerified: true }
        },
        include: {
          website: true,
          _count: { select: { metrics: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 60
      });

      res.json({
        success: true,
        content: content.map(serializeContent)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch explore content' });
    }
  });

}
