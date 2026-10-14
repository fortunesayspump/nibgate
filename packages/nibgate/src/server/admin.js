import { jsonResponse } from './response.js';
import { createNibgateContentSettings, settingsToAccessPolicy, settingsToUnlockPolicy, NIBGATE_CONTENT_SETTING_FIELDS } from '../core/settings.js';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';

export function createAdminApi(options = {}) {
  const store = options.store;
  if (!store) throw new Error('Admin API requires a store. Pass one from createFileStore() or createMemoryStore().');

  async function requireAdmin(req) {
    if (typeof options.authorize === 'function') return options.authorize(req);
    // Mounting admin routes must never make them public by default.
    return false;
  }

  async function handleList(req, res) {
    if (!await requireAdmin(req)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const all = await store.list();
    return jsonResponse({ ok: true, fields: NIBGATE_CONTENT_SETTING_FIELDS, items: all });
  }

  async function handleGet(req, res) {
    if (!await requireAdmin(req)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const item = await store.get(req.params.id);
    if (!item) return jsonResponse({ ok: false, error: 'Not found' }, { status: 404 });
    return jsonResponse({ ok: true, fields: NIBGATE_CONTENT_SETTING_FIELDS, item });
  }

  async function handleUpdate(req, res) {
    if (!await requireAdmin(req)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const settings = createNibgateContentSettings(req.body || {});
    const saved = await store.set(req.params.id, settings);
    return jsonResponse({ ok: true, item: saved });
  }

  async function handleDelete(req, res) {
    if (!await requireAdmin(req)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
    await store.remove(req.params.id);
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

    // Express 4 does not consume Fetch Responses or catch rejected promises.
    // Keep the direct handlers framework-neutral and adapt them at this boundary.
    const expressHandler = (handler) => (req, res, next) => {
      Promise.resolve().then(() => handler(req, res)).then(async (response) => {
        const body = Buffer.from(await response.arrayBuffer());
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(body);
      }).catch(next);
    };

    Route.get('/admin/nibgate/resources', expressHandler(handleList));
    Route.get('/admin/nibgate/resources/:id', expressHandler(handleGet));
    Route.post('/admin/nibgate/resources/:id', expressHandler(handleUpdate));
    Route.delete('/admin/nibgate/resources/:id', expressHandler(handleDelete));
    Route.get('/admin/nibgate', expressHandler(async (req) => {
      if (!await requireAdmin(req)) return jsonResponse({ ok: false, error: 'Unauthorized' }, { status: 403 });
      return new Response(adminPageHtml({ title: options.title || 'Nibgate Admin' }), {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }));

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
