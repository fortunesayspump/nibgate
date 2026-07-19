const express = require('express');
const bcrypt = require('bcryptjs');
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

module.exports = router;
