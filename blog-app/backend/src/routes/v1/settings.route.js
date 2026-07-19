const express = require('express');
const prisma = require('../../lib/prisma');
const { authenticate } = require('../../middlewares/auth');
const { status } = require('http-status');

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
        recipientWallet: settings.recipientWallet || '',
        defaultPrice: settings.defaultPrice || '0.01',
        defaultCurrency: settings.defaultCurrency || 'USDC',
        paymentNetwork: settings.paymentNetwork || 'eip155:5042002',
        siteId: site.id,
        subdomain: site.subdomain,
        widgetScript: `<script async src="https://nibgate.xyz/widget.js" data-nibgate-site="${site.id}" data-nibgate-token="${site.verifyToken || ''}"></script>`,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/', authenticate, async (req, res, next) => {
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
    };
    updateData.settings = JSON.stringify(newSettings);

    await prisma.site.update({ where: { id: site.id }, data: updateData });

    res.json({ success: true, settings: { ...current, ...newSettings, name: updateData.name || site.name, description: updateData.description || site.description } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
