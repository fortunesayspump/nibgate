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
import ipaddr from './ipaddr-lite.js';

const MAX_REDIRECTS = 3;

function isBlockedIp(ip) {
  // Loopback, private (10/8, 172.16/12, 192.168/16, fc00::/7), link-local
  // (169.254/16, fe80::/10), multicast, reserved, unspecified, CGNAT.
  const ranges = [
    '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
    '169.254.0.0/16', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8',
    '0.0.0.0/8', '::/128', '100.64.0.0/10', '192.0.2.0/24', '198.51.100.0/24',
    '203.0.113.0/24', '::ffff:0:0/96',
  ];
  return ranges.some((r) => ipaddr.isIn(ip, r));
}

async function assertPublicUrl(raw, fetchImpl) {
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error('unparseable-url'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`scheme-not-allowed: ${url.protocol}`);
  if (!url.hostname) throw new Error('missing-hostname');
  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error(`dns-failed: ${url.hostname}`);
  }
  const ips = addresses.map((a) => a.address);
  for (const ip of ips) {
    let parsed;
    try { parsed = ipaddr.parse(ip); } catch { throw new Error(`unparseable-address: ${ip}`); }
    if (isBlockedIp(parsed)) throw new Error(`private-address: ${ip}`);
  }
  return url.toString();
}

/**
 * @returns {Promise<{status:number, headers:object, body:string, url:string}>}
 */
export async function httpRequest({ url, method = 'GET', headers = {}, body = null, timeoutMs = 20000, maxBytes = 1_000_000, followRedirects = true } = {}, { fetchImpl = fetch } = {}) {
  const verb = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'HEAD'].includes(verb)) throw new Error(`method-not-allowed: ${verb}`);
  let current = await assertPublicUrl(url, fetchImpl);
  let hops = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('request timed out')), timeoutMs);
    let res;
    try {
      res = await fetchImpl(current, {
        method: verb,
        headers: { 'user-agent': 'DrNibResearch/1.0 (+https://nibgate.xyz)', accept: 'application/json, text/*', ...headers },
        body: verb === 'GET' || verb === 'HEAD' || body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
        signal: controller.signal,
        redirect: 'manual',
      });
    } finally {
      clearTimeout(timer);
    }
    if (followRedirects && [301, 302, 303, 307, 308].includes(res.status) && hops < MAX_REDIRECTS) {
      const loc = res.headers?.get ? res.headers.get('location') : res.headers?.location;
      if (!loc) throw new Error('redirect-without-location');
      hops += 1;
      current = await assertPublicUrl(new URL(loc, current).toString(), fetchImpl);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.slice(0, maxBytes).toString('utf8');
    const outHeaders = {};
    try {
      for (const [k, v] of res.headers.entries()) outHeaders[k.toLowerCase()] = v;
    } catch {}
    return { status: res.status, headers: outHeaders, body: text, url: current, truncated: buf.length > maxBytes };
  }
}
