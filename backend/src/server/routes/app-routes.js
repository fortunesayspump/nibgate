import { createAppState } from '../app-state.js';

export function registerAppRoutes(app, context) {
  const { store, getConfig } = context;

  app.get('/api/app/state', (_req, res) => {
    res.json(createAppState(getConfig(), store));
  });

  app.get('/api/nibgate/status', (_req, res) => {
    const config = getConfig();
    res.json({
      site: {
        name: config.site.name,
        origin: config.site.origin
      },
      hub: config.hub,
      widgetUrl: `${config.hub?.appUrl || 'https://nibgate.xyz'}/widget.js`
    });
  });
}
