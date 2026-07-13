import crypto from 'node:crypto';
import { serverEnv } from './env.js';

export function createWebhookManager(options = {}) {
  const webhookUrl = options.webhookUrl || serverEnv('NIBGATE_WEBHOOK_URL') || '';
  const webhookSecret = options.webhookSecret || serverEnv('NIBGATE_WEBHOOK_SECRET') || '';
  const subscribers = new Map();

  function sign(payload) {
    if (!webhookSecret) return '';
    return crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(payload)).digest('hex');
  }

  function subscribe(event, url, secret = '') {
    if (!subscribers.has(event)) subscribers.set(event, []);
    subscribers.get(event).push({ url, secret });
    return () => {
      const list = subscribers.get(event) || [];
      subscribers.set(event, list.filter((s) => s.url !== url));
    };
  }

  async function emit(event, payload) {
    const body = { event, timestamp: new Date().toISOString(), data: payload };
    const list = subscribers.get(event) || [];
    const results = [];

    for (const { url, secret } of list) {
      try {
        const sig = secret ? crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex') : '';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(sig ? { 'x-nibgate-webhook-signature': sig } : {})
          },
          body: JSON.stringify(body)
        });
        results.push({ url, ok: response.ok, status: response.status });
      } catch (err) {
        results.push({ url, ok: false, error: err.message });
      }
    }

    if (webhookUrl) {
      try {
        const sig = sign(body);
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(sig ? { 'x-nibgate-webhook-signature': sig } : {})
          },
          body: JSON.stringify(body)
        });
        results.push({ url: webhookUrl, ok: response.ok, status: response.status });
      } catch (err) {
        results.push({ url: webhookUrl, ok: false, error: err.message });
      }
    }

    return results;
  }

  return { subscribe, emit, sign };
}

export function createWebhookApi(manager, options = {}) {
  const authorize = options.authorize || ((req) => {
    const key = req.headers?.['x-webhook-key'] || req.query?.key;
    return key === (options.adminKey || process.env.NIBGATE_WEBHOOK_ADMIN_KEY);
  });

  async function handleSubscribe(req, res) {
    if (!authorize(req)) return res.status(403).json({ error: 'Unauthorized' });
    const { event, url, secret } = req.body || {};
    if (!event || !url) return res.status(400).json({ error: 'event and url are required' });
    manager.subscribe(event, url, secret || '');
    return res.json({ ok: true, event, url });
  }

  async function handleTest(req, res) {
    if (!authorize(req)) return res.status(403).json({ error: 'Unauthorized' });
    const results = await manager.emit('webhook_test', { message: 'Webhook test from Nibgate admin' });
    return res.json({ ok: true, results });
  }

  function router(express) {
    const Route = express?.Router ? express.Router() : null;
    if (!Route) return null;
    Route.post('/admin/nibgate/webhooks/subscribe', handleSubscribe);
    Route.post('/admin/nibgate/webhooks/test', handleTest);
    return Route;
  }

  return { handleSubscribe, handleTest, router, manager };
}
