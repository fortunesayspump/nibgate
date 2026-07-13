import { db } from '@nibgate/internal/db.js';
import { syncNewsletterSubscriber } from '../newsletter/resend.js';

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
          status: 'active',
          resendSyncStatus: 'pending',
          resendSyncError: null
        },
        create: {
          email,
          source,
          resendSyncStatus: 'pending'
        }
      });

      const syncResult = await syncNewsletterSubscriber({ email, source });
      const syncedAt = syncResult.synced ? new Date() : null;

      await db.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: {
          resendContactId: syncResult.contactId || subscriber.resendContactId,
          resendSyncedAt: syncedAt || subscriber.resendSyncedAt,
          resendSyncStatus: syncResult.status,
          resendSyncError: syncResult.error ? syncResult.error.slice(0, 500) : null
        }
      });

      res.json({
        ok: true,
        subscribed: true,
        email: subscriber.email,
        synced: syncResult.synced
      });
    } catch (error) {
      console.error('Newsletter subscribe failed', error);
      res.status(500).json({ error: 'Could not subscribe right now. Please try again.' });
    }
  });
}
