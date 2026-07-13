import { jsonResponse } from './response.js';
import { createNibgateContentSettings, settingsToAccessPolicy, settingsToUnlockPolicy, NIBGATE_CONTENT_SETTING_FIELDS } from '../core/settings.js';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';

export function createAdminApi(options = {}) {
  const store = options.store;
  if (!store) throw new Error('Admin API requires a store. Pass one from createFileStore() or createMemoryStore().');

  function requireAdmin(req, _res) {
    if (typeof options.authorize === 'function') return options.authorize(req);
    return true;
  }

  async function handleList(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const all = store.list();
    return jsonResponse({ ok: true, fields: NIBGATE_CONTENT_SETTING_FIELDS, items: all });
  }

  async function handleGet(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const item = store.get(req.params.id);
    if (!item) return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
    return jsonResponse({ ok: true, fields: NIBGATE_CONTENT_SETTING_FIELDS, item });
  }

  async function handleUpdate(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const settings = createNibgateContentSettings(req.body || {});
    const saved = store.set(req.params.id, settings);
    return jsonResponse({ ok: true, item: saved });
  }

  async function handleDelete(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    store.remove(req.params.id);
    return jsonResponse({ ok: true });
  }

  function buildResourceFromSettings(id, settings) {
    const access = settingsToAccessPolicy(settings);
    const unlock = settingsToUnlockPolicy(settings);
    return normalizeResource({
      id,
      type: settings.type,
      price: settings.price,
      currency: settings.currency,
      recipient: settings.recipient,
      access,
      unlock,
      ratingsEnabled: settings.ratingsEnabled,
      license: settings.license
    });
  }

  function router(express) {
    const Route = express?.Router ? express.Router() : null;
    if (!Route) return null;

    Route.get('/admin/nibgate/resources', handleList);
    Route.get('/admin/nibgate/resources/:id', handleGet);
    Route.post('/admin/nibgate/resources/:id', handleUpdate);
    Route.delete('/admin/nibgate/resources/:id', handleDelete);
    Route.get('/admin/nibgate', (_req, res) => {
      const html = adminPageHtml({ title: options.title || 'Nibgate Admin' });
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(html);
    });

    return Route;
  }

  return {
    handleList,
    handleGet,
    handleUpdate,
    handleDelete,
    buildResourceFromSettings,
    router,
    store,
    settingsFields: NIBGATE_CONTENT_SETTING_FIELDS
  };
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_HTML_PATH = resolve(__dirname, 'admin-page.html');

function adminPageHtml(options = {}) {
  const title = options.title || 'Nibgate Admin';
  const apiBase = options.apiBase || '/admin/nibgate';
  const baseHtml = readFileSync(ADMIN_HTML_PATH, 'utf8');
  return baseHtml.replace('${TITLE}', title).replace('${API_BASE}', apiBase);
}

export { adminPageHtml };
