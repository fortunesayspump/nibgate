const express = require('express');
const bcrypt = require('bcryptjs');
const validate = require('../../middlewares/validate');
const settingsValidation = require('../../validations/settings.validation');
const prisma = require('../../lib/prisma');
const { authenticate } = require('../../middlewares/auth');
const { status } = require('http-status');
const { invalidateSite } = require('../../lib/tenant-cache');
const config = require('../../config/config');

const router = express.Router();

function parseSettings(site) {
  try { return site.settings ? JSON.parse(site.settings) : {}; } catch { return {}; }
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.siteId } });
    if (!site) return res.status(404).json({ error: 'Site not found' });
    const settings = parseSettings(site);
    res.json({
      success: true,
      settings: {
        name: site.name,
        description: site.description,
        aboutMarkdown: settings.aboutMarkdown || '',
        recipientWallet: settings.recipientWallet || '',
        defaultPrice: settings.defaultPrice || '0.01',
        defaultCurrency: settings.defaultCurrency || 'USDC',
        paymentNetwork: settings.paymentNetwork || 'eip155:5042002',
        siteId: site.id,
        subdomain: site.subdomain,
        hubSiteId: settings.hubSiteId || null,
        hubToken: settings.hubToken || null,
        widgetScript: `<script async src="${config.nibgate.webBase}/widget.js" data-nibgate-site="${site.id}" data-nibgate-token="${site.verifyToken || ''}" data-nibgate-api="${config.nibgate.hubApi}"></script>`,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/', authenticate, validate(settingsValidation.updateSettings), async (req, res, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.siteId } });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const current = parseSettings(site);
    const updateData = {};

    if (req.body.name !== undefined) updateData.name = String(req.body.name).trim();
    if (req.body.description !== undefined) updateData.description = String(req.body.description).trim();

    const newSettings = {
      ...current,
      ...(req.body.recipientWallet !== undefined ? { recipientWallet: String(req.body.recipientWallet).trim() } : {}),
      ...(req.body.defaultPrice !== undefined ? { defaultPrice: String(req.body.defaultPrice).trim() } : {}),
      ...(req.body.defaultCurrency !== undefined ? { defaultCurrency: String(req.body.defaultCurrency).trim() } : {}),
      ...(req.body.paymentNetwork !== undefined ? { paymentNetwork: String(req.body.paymentNetwork).trim() } : {}),
      ...(req.body.aboutMarkdown !== undefined ? { aboutMarkdown: String(req.body.aboutMarkdown).trim() } : {}),
    };
    updateData.settings = JSON.stringify(newSettings);

    await prisma.site.update({ where: { id: site.id }, data: updateData });
    invalidateSite(req.subdomain);

    res.json({ success: true, settings: { ...current, ...newSettings, name: updateData.name || site.name, description: updateData.description || site.description } });
  } catch (error) {
    next(error);
  }
});

router.put('/password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    res.json({ success: true, message: 'Password updated.' });
  } catch (error) {
    next(error);
  }
});

router.post('/link-hub', authenticate, async (req, res, next) => {
  try {
    const { linkToken } = req.body;
    if (!linkToken) return res.status(400).json({ error: 'linkToken is required.' });

    const hubApi = config.nibgate.hubApi;
    const domain = `${req.site.subdomain}.nibgate.xyz`;

    const hubRes = await fetch(`${hubApi}/hub/blog/link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkToken, domain, name: req.site.name }),
    });

    const hubData = await hubRes.json();
    if (!hubRes.ok) return res.status(hubRes.status).json({ error: hubData.error || 'Hub verification failed.' });

    let settings = {};
    try { settings = req.site.settings ? JSON.parse(req.site.settings) : {}; } catch {}
    settings.hubSiteId = hubData.siteId;
    settings.hubToken = hubData.verifyToken;
    // Auto-fill recipient wallet from hub account if not already set
    if (!settings.recipientWallet && hubData.site?.ownerWallet) {
      settings.recipientWallet = hubData.site.ownerWallet;
    }

    await prisma.site.update({ where: { id: req.siteId }, data: { settings: JSON.stringify(settings) } });
    invalidateSite(req.subdomain);

    res.json({ success: true, siteId: hubData.siteId, domain: hubData.domain });
  } catch (error) {
    next(error);
  }
});

router.post('/link-hub/disconnect', authenticate, async (req, res, next) => {
  try {
    let settings = {};
    try { settings = req.site.settings ? JSON.parse(req.site.settings) : {}; } catch {}

    const hubApi = config.nibgate.hubApi;

    if (settings.hubSiteId && settings.hubToken) {
      const hubRes = await fetch(`${hubApi}/hub/blog/link/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: settings.hubSiteId, verifyToken: settings.hubToken }),
      });

      const hubData = await hubRes.json();
      if (!hubRes.ok) {
        return res.status(hubRes.status).json({ error: hubData.error || 'Hub disconnect failed.' });
      }
    }

    delete settings.hubSiteId;
    delete settings.hubToken;

    await prisma.site.update({ where: { id: req.siteId }, data: { settings: JSON.stringify(settings) } });
    invalidateSite(req.subdomain);

    res.json({ success: true, message: 'Disconnected from hub.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
