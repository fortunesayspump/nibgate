import { connectSite, getHubSummary, ingestHubEvent, syncSiteManifest, verifySiteOwnership } from '../hub-handlers.js';

export function registerHubRoutes(app) {
  app.get('/api/hub/summary', async (_req, res) => {
    const result = await getHubSummary();
    res.status(result.status).json(result.body);
  });

  app.post('/api/hub/sites/connect', async (req, res) => {
    const result = await connectSite(req, req.body);
    res.status(result.status).json(result.body);
  });

  app.post('/api/hub/sites/sync', async (req, res) => {
    const result = await syncSiteManifest(req, req.body);
    res.status(result.status).json(result.body);
  });

  app.post('/api/hub/sites/verify', async (req, res) => {
    const result = await verifySiteOwnership(req, req.body);
    res.status(result.status).json(result.body);
  });

  app.post('/api/hub/events', async (req, res) => {
    const result = await ingestHubEvent(req, req.body);
    res.status(result.status).json(result.body);
  });
}
