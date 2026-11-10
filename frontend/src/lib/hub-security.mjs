// Shared by Next middleware and the OpenNext adapter (whose Node middleware
// manifest is deliberately disabled). Never use a caller-supplied nonce.
export function pageSecurityHeaders(request, { development = false, verifierUrl = process.env.NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_URL } = {}) {
  const nonce = btoa(crypto.randomUUID());
  const url = new URL(request.url);
  const walletHosts = ['rpc', 'relay', 'pulse', 'api', 'keys', 'notify', 'echo', 'push', 'verify', 'secure']
    .flatMap(service => [`https://${service}.walletconnect.com`, `https://${service}.walletconnect.org`]);
  // This is independently pinned public build configuration, never a URL
  // learned from a guest response or a request header.
  const verifierOrigins = [];
  if (verifierUrl) {
    const verifier = new URL(verifierUrl);
    if (verifier.protocol !== 'https:' || verifier.username || verifier.password) throw new Error('Invalid public verifier origin');
    verifierOrigins.push(verifier.origin);
  }
  const policy = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(development ? ["'unsafe-eval'"] : [])],
    // The existing design system and embedded wallet inject inline styles.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'https:', 'data:', 'blob:'],
    'media-src': ["'self'", 'https:', 'blob:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://fonts.reown.com'],
    'connect-src': ["'self'", 'https://*.nibgate.xyz', 'https://rpc.mainnet.arc.io', 'https://rpc.testnet.arc.io',
      ...walletHosts, ...verifierOrigins, 'https://*.reown.com', 'wss://relay.walletconnect.com', 'wss://relay.walletconnect.org',
      'wss://www.walletlink.org', 'https://cca-lite.coinbase.com', 'https://*.phala.network', 'https://*.railway.app',
      ...(development ? ['http://localhost:*', 'ws://localhost:*', 'http://127.0.0.1:*', 'ws://127.0.0.1:*'] : [])],
    'frame-src': ["'self'", 'https://verify.walletconnect.com', 'https://verify.walletconnect.org',
      'https://secure.walletconnect.com', 'https://secure.walletconnect.org', 'https://*.reown.com',
      'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const csp = Object.entries(policy).map(([directive, sources]) => `${directive} ${sources.join(' ')}`).join('; ');
  const headers = new Headers(request.headers);
  headers.set('content-security-policy', csp);
  headers.set('x-nonce', nonce);
  headers.set('x-nibgate-pathname', url.pathname);
  return { headers, csp, nonce };
}

export function protectResponse(response, csp) {
  const out = new Response(response.body, response);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('x-frame-options', 'DENY');
  // Reown's sign-in popup needs to retain its opener.
  out.headers.set('cross-origin-opener-policy', 'same-origin-allow-popups');
  out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (csp) {
    if (!out.headers.has('content-security-policy')) out.headers.set('content-security-policy', csp);
    out.headers.set('cache-control', 'private, no-store, no-transform');
  }
  return out;
}
