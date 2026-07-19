const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { status } = require('http-status');
const { isValidSubdomain } = require('../../lib/validate');

const router = express.Router();

const setupKey = process.env.SETUP_KEY || '';

router.post('/', async (req, res) => {
  try {
    if (setupKey && req.body.setupKey !== setupKey) {
      return res.status(403).json({ error: 'Invalid setup key.' });
    }

    const { subdomain, name, email, password } = req.body;
    if (!subdomain || !email || !password) {
      return res.status(400).json({ error: 'subdomain, email, and password are required.' });
    }
    if (!isValidSubdomain(subdomain)) {
      return res.status(400).json({ error: 'Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens. Cannot start or end with hyphen.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const site = await prisma.site.create({
      data: {
        subdomain: String(subdomain).trim().toLowerCase(),
        name: name || subdomain,
        verifyToken: require('crypto').randomBytes(16).toString('hex'),
        settings: JSON.stringify({ recipientWallet: '', defaultPrice: '0.01', defaultCurrency: 'USDC', paymentNetwork: 'eip155:5042002' }),
      },
    });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        siteId: site.id,
        name: name || subdomain,
        email: String(email).trim().toLowerCase(),
        password: hashedPassword,
        role: 'author',
      },
    });

    res.status(201).json({
      success: true,
      site: { id: site.id, subdomain: site.subdomain, name: site.name },
      user: { id: user.id, email: user.email },
      widgetScript: `<script async src="https://nibgate.xyz/widget.js" data-nibgate-site="${site.id}" data-nibgate-token="${site.verifyToken}"></script>`,
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Subdomain or email already exists.' });
    }
    res.status(500).json({ error: 'Setup failed', details: error.message });
  }
});

module.exports = router;
