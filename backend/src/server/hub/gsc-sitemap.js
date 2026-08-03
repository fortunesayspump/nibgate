import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';

const WEBMASTERS_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const WEBMASTERS_BASE = 'https://www.googleapis.com/webmasters/v3';

function readCredentials() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON || '';
  if (!raw) return null;
  const value = raw.trim();
  const text = value.startsWith('{') ? value : fs.readFileSync(value, 'utf8');
  return JSON.parse(text);
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify(payload));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claims}`);
  return `${header}.${claims}.${sign.sign(creds.private_key, 'base64url')}`;
}

let creds = null;
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  creds = creds || readCredentials();
  if (!creds) throw new Error('GSC_SERVICE_ACCOUNT_JSON is not set');
  const iat = Math.floor(now / 1000);
  const assertion = signJwt({
    iss: creds.client_email,
    scope: WEBMASTERS_SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  });
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}`;
  const data = await request(TOKEN_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

function request(url, { method = 'GET', body, headers = {}, token } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
      if (typeof body === 'string' && options.headers['Content-Type'].includes('application/json')) {
        options.headers['Content-Type'] = 'application/json; charset=utf-8';
      }
    } else {
      options.headers['Content-Length'] = 0;
    }
    const req = https.request(options, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        let parsed;
        try { parsed = b ? JSON.parse(b) : {}; } catch { parsed = { raw: b }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
        const err = new Error(`HTTP ${res.statusCode} ${url.split('/').slice(-1)[0]}: ${b.slice(0, 200)}`);
        err.status = res.statusCode;
        err.body = parsed;
        reject(err);
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function enc(path) {
  return encodeURIComponent(path);
}

export async function fetchSiteList() {
  const hubBase = (process.env.GSC_HUB_BASE || 'https://api.nibgate.xyz').replace(/\/+$/, '');
  const res = await request(`${hubBase}/api/hub/sitemap-sites`);
  const domains = (res.sites || []).filter((d) => typeof d === 'string' && d);
  return [...new Set(domains.map((d) => d.toLowerCase()))];
}

export async function listSubmittedSitemaps() {
  const site = process.env.GSC_SITE || 'sc-domain:nibgate.xyz';
  const token = await getAccessToken();
  const list = await request(`${WEBMASTERS_BASE}/sites/${enc(site)}/sitemaps`, { token });
  return {
    site,
    sitemaps: (list.sitemap || []).map((s) => ({ path: s.path, lastSubmitted: s.lastSubmitted, isPending: s.isPending })),
  };
}

export async function submitAllSiteSitemaps({ force = false } = {}) {
  creds = creds || readCredentials();
  if (!creds) return { disabled: true, reason: 'GSC_SERVICE_ACCOUNT_JSON is not set' };
  const site = process.env.GSC_SITE || 'sc-domain:nibgate.xyz';
  const dryRun = process.env.GSC_DRY_RUN === '1';
  force = force || process.env.GSC_FORCE === '1';
  const domains = await fetchSiteList();
  const token = await getAccessToken();

  let existing = new Set();
  if (!dryRun && !force) {
    const list = await request(`${WEBMASTERS_BASE}/sites/${enc(site)}/sitemaps`, { token });
    existing = new Set((list.sitemap || []).map((s) => s.path));
  }

  const summary = { site, dryRun, force, domains: domains.length, added: 0, skipped: 0, failed: [] };
  for (const domain of domains) {
    const sitemapUrl = `https://${domain}/sitemap.xml/`;
    try {
      if (!force && existing.has(sitemapUrl)) {
        summary.skipped += 1;
      } else {
        if (!dryRun) {
          await request(`${WEBMASTERS_BASE}/sites/${enc(site)}/sitemaps/${enc(sitemapUrl)}`, { method: 'PUT', token, body: '' });
        }
        summary.added += 1;
      }
    } catch (error) {
      summary.failed.push(`${domain}: ${error.message.slice(0, 120)}`);
    }
  }
  return summary;
}
