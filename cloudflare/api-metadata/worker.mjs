import metadata from './metadata.json' with { type: 'json' };

const safeHeaders = new Set(['accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length', 'user-agent', 'host', 'connection', 'cf-ray', 'cf-connecting-ip', 'cf-ipcountry', 'cf-visitor', 'cdn-loop', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip', 'mcp-protocol-version']);
const MAX_CLASSIFY_BYTES = 65536;
async function smallJson(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return null;
  if (Number(request.headers.get('content-length')) > MAX_CLASSIFY_BYTES) return null;
  const reader = request.clone().body?.getReader();
  if (!reader) return null;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Error('classification deadline')), 1500); });
  try {
    let size = 0; const chunks = [];
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CLASSIFY_BYTES) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
function response(value, request, status = 200) {
  const body = value === undefined ? null : JSON.stringify(value);
  const headers = {
    'access-control-allow-credentials': 'true', vary: 'Origin',
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'cache-control': 'no-store', 'x-nibgate-edge-metadata': metadata.sourceSha256,
  };
  if (body !== null) headers['content-type'] = 'application/json; charset=utf-8';
  if (new URL(request.url).pathname.startsWith('/api/')) headers.deprecation = 'true';
  return new Response(request.method === 'HEAD' ? null : body, { status, headers });
}
export async function handle(request, forward = fetch) {
  const origin = () => forward(request, { redirect: 'manual' });
  const url = new URL(request.url);
  const data = Object.hasOwn(metadata.hosts, url.hostname) ? metadata.hosts[url.hostname] : null;
  // Unknown flows stay on the origin path; no cache or automatic retries.
  if (!data || url.protocol !== 'https:' || url.search || [...request.headers.keys()].some(h => !safeHeaders.has(h))) return origin();
  const protocol = request.headers.get('mcp-protocol-version');
  if (protocol && protocol !== data.info.protocolVersion) return origin();
  if (request.method === 'GET' || request.method === 'HEAD') {
    const value = { '/mcp': data.info, '/.well-known/mcp.json': data.card, '/openapi.json': data.openapi, '/api/openapi.json': data.openapi }[url.pathname];
    return value ? response(value, request) : origin();
  }
  if (request.method !== 'POST' || url.pathname !== '/mcp') return origin();
  const message = await smallJson(request);
  if (!message || Array.isArray(message) || typeof message !== 'object' || message.jsonrpc !== '2.0' || Object.keys(message).some(k => !['jsonrpc', 'id', 'method', 'params'].includes(k))) return origin();
  if (message.id !== undefined && message.id !== null && !['string', 'number'].includes(typeof message.id)) return origin();
  if (message.params !== undefined && (!message.params || Array.isArray(message.params) || typeof message.params !== 'object' || '_meta' in message.params)) return origin();
  const id = message.id ?? null;
  const rpc = result => response({ jsonrpc: '2.0', id, result }, request);
  switch (message.method) {
    case 'initialize': return rpc(data.info);
    case 'ping': return rpc({});
    case 'tools/list': return rpc({ tools: data.tools });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return message.id === undefined ? response(undefined, request, 202) : origin();
    default: return origin();
  }
}
export default { fetch: request => handle(request) };
