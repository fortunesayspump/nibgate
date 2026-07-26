const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { status } = require('http-status');
const { isValidSubdomain } = require('../../lib/validate');

async function addVercelDomain(subdomain) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return { skipped: true, reason: 'VERCEL_TOKEN or VERCEL_PROJECT_ID not set' };

  const domain = `${subdomain}.nibgate.xyz`;
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
  });
  const data = await res.json();
  if (!res.ok && data.error?.code !== 'domain_already_in_use') {
    return { skipped: true, reason: data.error?.message || data.message || 'Vercel API error' };
  }
  return { success: true, domain };
}

const router = express.Router();

const setupKey = process.env.SETUP_KEY || '';

router.post('/', async (req, res) => {
  try {
    if (setupKey && req.body.setupKey !== setupKey) {
      return res.status(403).json({ error: 'Invalid setup key.' });
    }

    const { subdomain, name, email, username, password } = req.body;
    if (!subdomain || !password) {
      return res.status(400).json({ error: 'subdomain and password are required.' });
    }
    if (!email && !username) {
      return res.status(400).json({ error: 'email or username is required.' });
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
        username: String(username || subdomain).trim().toLowerCase(),
        email: email ? String(email).trim().toLowerCase() : `${subdomain}@nibgate.xyz`,
        password: hashedPassword,
        role: 'author',
      },
    });

    const vercelDomain = await addVercelDomain(subdomain);

    res.status(201).json({
      success: true,
      site: { id: site.id, subdomain: site.subdomain, name: site.name },
      user: { id: user.id, email: user.email, username: user.username },
      vercelDomain: vercelDomain.success ? { domain: vercelDomain.domain, status: 'added' } : { skipped: true, reason: vercelDomain.reason },
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Subdomain or email already exists.' });
    }
    next(error);
  }
});

module.exports = router;
