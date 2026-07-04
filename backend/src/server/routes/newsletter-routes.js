import { db } from '@nibgate/cli/src/core/db.js';

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function registerNewsletterRoutes(app) {
  app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email || req.body.EMAIL);
      const source = String(req.body.source || 'footer').trim().slice(0, 80);

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }

      const subscriber = await db.newsletterSubscriber.upsert({
        where: { email },
        update: {
          source,
          status: 'active'
        },
        create: {
          email,
          source
        }
      });

      res.json({
        ok: true,
        subscribed: true,
        email: subscriber.email
      });
    } catch (error) {
      console.error('Newsletter subscribe failed', error);
      res.status(500).json({ error: 'Could not subscribe right now. Please try again.' });
    }
  });
}
