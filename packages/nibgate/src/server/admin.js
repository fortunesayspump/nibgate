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
    if (!requireAdmin(req, res)) return jsonResponse({ error: 'Unauthorized' }, { status: 403 });
    const all = store.list();
    return jsonResponse({ success: true, fields: NIBGATE_CONTENT_SETTING_FIELDS, items: all });
  }

  async function handleGet(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ error: 'Unauthorized' }, { status: 403 });
    const item = store.get(req.params.id);
    if (!item) return jsonResponse({ error: 'Not found' }, { status: 404 });
    return jsonResponse({ success: true, fields: NIBGATE_CONTENT_SETTING_FIELDS, item });
  }

  async function handleUpdate(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ error: 'Unauthorized' }, { status: 403 });
    const settings = createNibgateContentSettings(req.body || {});
    const saved = store.set(req.params.id, settings);
    return jsonResponse({ success: true, item: saved });
  }

  async function handleDelete(req, res) {
    if (!requireAdmin(req, res)) return jsonResponse({ error: 'Unauthorized' }, { status: 403 });
    store.remove(req.params.id);
    return jsonResponse({ success: true });
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

function adminPageHtml(options = {}) {
  const title = options.title || 'Nibgate Admin';
  const apiBase = options.apiBase || '/admin/nibgate';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f0;color:#1a1a18;padding:24px;max-width:960px;margin:0 auto}
  h1{font-size:28px;font-weight:700;margin-bottom:8px}
  p.sub{color:#666;margin-bottom:24px}
  .card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
  .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .card-header h3{font-size:18px;font-weight:600}
  .status{font-size:12px;padding:3px 10px;border-radius:99px;font-weight:600}
  .status-gated{background:#fef3c7;color:#92400e}
  .status-open{background:#d1fae5;color:#065f46}
  .status-hidden{background:#fce4ec;color:#c62828}
  .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .field{display:flex;flex-direction:column;gap:4px}
  .field label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#555}
  .field input,.field select{font-size:14px;padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#fff}
  .field input:focus,.field select:focus{outline:2px solid #7c9a6d;border-color:transparent}
  .field .checkbox-row{display:flex;align-items:center;gap:8px;padding-top:6px}
  .field .checkbox-row input[type="checkbox"]{width:18px;height:18px}
  .empty{text-align:center;padding:48px;color:#888}
  .toast{position:fixed;bottom:24px;right:24px;background:#1a1a18;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;opacity:0;transition:opacity 0.3s;z-index:100}
  .toast.show{opacity:1}
  .toast.error{background:#c62828}
  .header-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
  .header-bar a{color:#7c9a6d;text-decoration:none;font-size:14px;font-weight:600}
  .header-bar a:hover{text-decoration:underline}
  .help-text{font-size:12px;color:#888;margin-top:2px}
</style>
</head>
<body>
<div class="header-bar">
  <div>
    <h1>Nibgate Admin</h1>
    <p class="sub">Manage gating, pricing, and settings for your content.</p>
  </div>
  <a href="/nibgate.json" target="_blank">View manifest →</a>
</div>
<div id="app"><div class="empty">Loading resources...</div></div>
<div id="toast" class="toast"></div>
<script>
const API = '${apiBase}';
let fields = [];
let items = [];

async function load() {
  try {
    const res = await fetch(API + '/resources');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load');
    fields = data.fields || [];
    items = data.items || [];
    render();
  } catch (err) {
    document.getElementById('app').innerHTML = '<div class="empty">Error loading: ' + err.message + '</div>';
  }
}

function statusLabel(item) {
  if (item.humanAccess === 'paid') return '<span class="status status-gated">Gated</span>';
  if (item.humanAccess === 'blocked') return '<span class="status status-hidden">Blocked</span>';
  return '<span class="status status-open">Open</span>';
}

function render() {
  const app = document.getElementById('app');
  if (!items.length) {
    app.innerHTML = '<div class="empty">No resources configured yet. Add resources through the Nibgate SDK and they will appear here after the next manifest sync.</div>';
    return;
  }
  app.innerHTML = items.map(item => {
    const humanAccess = fields.find(f => f.name==='humanAccess');
    const agentAccess = fields.find(f => f.name==='agentAccess');
    const unlockMode = fields.find(f => f.name==='unlockMode');
    return '<div class="card" data-id="' + item.id + '">' +
      '<div class="card-header">' +
        '<h3>' + escapeHtml(item.title || item.id) + '</h3>' +
        statusLabel(item) +
      '</div>' +
      '<div class="field-row">' +
        selectField('humanAccess', 'Human access', humanAccess?.options || ['free','paid','blocked'], item.humanAccess) +
        selectField('agentAccess', 'Agent access', agentAccess?.options || ['free','paid','blocked'], item.agentAccess) +
      '</div>' +
      '<div class="field-row">' +
        selectField('unlockMode', 'Unlock mode', unlockMode?.options || ['one_time'], item.unlockMode) +
        selectField('paymentRail', 'Payment rail', ['gateway','transfer'], item.paymentRail || 'gateway') +
      '</div>' +
      '<div class="field-row">' +
        textField('price', 'Price (' + (item.currency || 'USDC') + ')', item.price) +
        textField('currency', 'Currency', item.currency || 'USDC') +
      '</div>' +
      '<div class="field-row">' +
        textField('recipient', 'Recipient wallet', item.recipient || '') +
        checkboxField('ratingsEnabled', 'Enable onchain ratings', item.ratingsEnabled !== false) +
      '</div>' +
      '<div class="field-row">' +
        selectField('type', 'Content type', ['article','music','video','image'], item.type || 'article') +
        checkboxField('publishToNibgate', 'Publish to discovery', item.publishToNibgate !== false) +
      '</div>' +
      '<div><button class="save-btn" onclick="save(this)">Save</button></div>' +
    '</div>';
  }).join('');
}

function textField(name, label, value) {
  return '<div class="field"><label>' + label + '</label><input type="text" name="' + name + '" value="' + escapeAttr(value || '') + '" /></div>';
}

function selectField(name, label, options, value) {
  const opts = (options || []).map(o => '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>').join('');
  return '<div class="field"><label>' + label + '</label><select name="' + name + '">' + opts + '</select></div>';
}

function checkboxField(name, label, checked) {
  return '<div class="field"><label>' + label + '</label><div class="checkbox-row"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + ' /></div></div>';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function save(btn) {
  const card = btn.closest('.card');
  const id = card.dataset.id;
  const inputs = card.querySelectorAll('[name]');
  const body = {};
  inputs.forEach(inp => {
    if (inp.type === 'checkbox') body[inp.name] = inp.checked;
    else body[inp.name] = inp.value;
  });
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const res = await fetch(API + '/resources/' + encodeURIComponent(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Save failed');
    toast('Saved ' + (data.item.title || id), 'success');
    load();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type==='error'?'error':'') + ' show';
  setTimeout(() => { el.classList.remove('show'); }, 3000);
}

load();
</script>
</body>
</html>`;
}

export { adminPageHtml };
