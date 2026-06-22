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

export function registerHubRoutes(app) {
  
  // 1. Dashboard: Register a new Website
  app.post('/api/hub/site/register', requireAuth, async (req, res) => {
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
          domain: domain.replace(/^https?:\/\//, '').replace(/\/$/, ''), // normalize domain
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
  });

  // 2. Dashboard: Verify Website Ownership
  app.post('/api/hub/site/verify', requireAuth, async (req, res) => {
    try {
      const { websiteId } = req.body;
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
  });

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

}
