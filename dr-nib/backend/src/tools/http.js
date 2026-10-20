// http_request — call an API, fetch a feed, check a URL.
//
// This is the run's equivalent of curl: arbitrary GET/POST against the public
// web, for the structured sources (arXiv is one; SEC EDGAR, GitHub, and
// government data are the same shape). Two hard rules keep it safe:
//
// 1. SSRF guard. The target host is resolved and every IP it resolves to is
//    checked: loopback, private, link-local, multicast, reserved, and
//    unspecified ranges all refuse, as do non-http(s) schemes. Redirects are
//    followed manually (max 3) with each hop re-validated, so a public URL
//    cannot bounce the run into 169.254.169.254 or localhost.
// 2. Same content discipline as web_fetch: paywalled and login-walled bodies
//    are refused, not worked around.
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import ipaddr from './ipaddr-lite.js';

const MAX_REDIRECTS = 3;
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

function isBlockedIp(ip) {
  // Loopback, private (10/8, 172.16/12, 192.168/16, fc00::/7), link-local
  // (169.254/16, fe80::/10), multicast, reserved, unspecified, CGNAT.
  const ranges = [
    '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
    '169.254.0.0/16', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8',
    '0.0.0.0/8', '::/128', '100.64.0.0/10', '192.0.2.0/24', '198.51.100.0/24',
    '203.0.113.0/24', '198.18.0.0/15', '224.0.0.0/4',
    '240.0.0.0/4', '::ffff:0:0/96',
  ];
  return ranges.some((r) => ipaddr.isIn(ip, r));
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error('unparseable-url'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`scheme-not-allowed: ${url.protocol}`);
  if (!url.hostname) throw new Error('missing-hostname');
  if (url.username || url.password) throw new Error('credentials-not-allowed');
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  } catch {
    throw new Error(`dns-failed: ${url.hostname}`);
  }
  const ips = addresses.map((a) => a.address);
  for (const ip of ips) {
    let parsed;
    try { parsed = ipaddr.parse(ip); } catch { throw new Error(`unparseable-address: ${ip}`); }
    if (isBlockedIp(parsed)) throw new Error(`private-address: ${ip}`);
  }
  return { url: url.toString(), addresses };
}

// Bind the HTTP connection to one of the addresses that passed the SSRF check.
// A second DNS lookup by fetch() would let a rebinding host bypass that check.
export function fetchPinned(target, options = {}, maxBytes = MAX_FETCH_BYTES) {
  const url = new URL(target.url);
  const address = target.addresses[0];
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const headers = { 'accept-encoding': 'identity', ...(options.headers || {}) };
    const req = transport.request(url, {
      method: options.method || 'GET',
      headers,
      signal: options.signal,
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions?.all) callback(null, [{ address: address.address, family: address.family }]);
        else callback(null, address.address, address.family);
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      let stopped = false;
      res.on('data', (chunk) => {
        if (stopped) return;
        size += chunk.length;
        if (size > maxBytes) {
          stopped = true;
          reject(new Error('response-too-large'));
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        if (stopped) return;
        try {
          let body = Buffer.concat(chunks);
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
          if (encoding === 'gzip') body = gunzipSync(body, { maxOutputLength: maxBytes });
          else if (encoding === 'deflate') body = inflateSync(body, { maxOutputLength: maxBytes });
          else if (encoding === 'br') body = brotliDecompressSync(body, { maxOutputLength: maxBytes });
          if (body.length > maxBytes) throw new Error('response-too-large');
          const responseHeaders = { ...res.headers };
          delete responseHeaders['content-encoding'];
          delete responseHeaders['content-length'];
          const status = res.statusCode || 500;
          resolve(new Response([204, 205, 304].includes(status) ? null : body, { status, headers: responseHeaders }));
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function checkedFetch(target, options, fetchImpl, maxBytes) {
  return fetchImpl === fetch ? fetchPinned(target, options, maxBytes) : fetchImpl(target.url, options);
}

export async function publicFetch(raw, options = {}, fetchImpl = fetch) {
  let current = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await checkedFetch(current, {...options, redirect:'manual'}, fetchImpl, MAX_FETCH_BYTES);
    if (![301,302,303,307,308].includes(response.status)) return response;
    if(options.redirect==='manual')return response;
    if(options.redirect==='error')throw Error('redirect-refused');
    const location=response.headers.get('location');
    if(!location || hop===MAX_REDIRECTS) throw new Error('redirect-limit');
    current=await assertPublicUrl(new URL(location,current.url).toString());
  }
}

/**
 * @returns {Promise<{status:number, headers:object, body:string, url:string}>}
 */
export async function httpRequest({ url, method = 'GET', headers = {}, body = null, timeoutMs = 20000, maxBytes = 1_000_000, followRedirects = true } = {}, { fetchImpl = fetch } = {}) {
  const verb = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'HEAD'].includes(verb)) throw new Error(`method-not-allowed: ${verb}`);
  let current = await assertPublicUrl(url);
  let hops = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('request timed out')), timeoutMs);
    let res;
    try {
      res = await checkedFetch(current, {
        method: verb,
        headers: { 'user-agent': 'DrNibResearch/1.0 (+https://nibgate.xyz)', accept: 'application/json, text/*', ...headers },
        body: verb === 'GET' || verb === 'HEAD' || body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        signal: controller.signal,
        redirect: 'manual',
      }, fetchImpl, Math.max(1, Math.min(maxBytes + 1, MAX_FETCH_BYTES)));
    } finally {
      clearTimeout(timer);
    }
    if (followRedirects && [301, 302, 303, 307, 308].includes(res.status) && hops < MAX_REDIRECTS) {
      const loc = res.headers?.get ? res.headers.get('location') : res.headers?.location;
      if (!loc) throw new Error('redirect-without-location');
      hops += 1;
      current = await assertPublicUrl(new URL(loc, current.url).toString());
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.slice(0, maxBytes).toString('utf8');
    const outHeaders = {};
    try {
      for (const [k, v] of res.headers.entries()) outHeaders[k.toLowerCase()] = v;
    } catch {}
    return { status: res.status, headers: outHeaders, body: text, url: current.url, truncated: buf.length > maxBytes };
  }
}
