import { pageSecurityHeaders } from './lib/hub-security.mjs';
import { NextResponse, type NextRequest } from 'next/server';

// Edge-safe: no wallet/internal imports here. NEXT_PUBLIC_API_URL wins;
// otherwise the production default follows the build network.
function defaultApiBase() {
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || 'testnet').toLowerCase() === 'mainnet'
    ? 'https://api.nibgate.xyz'
    : 'https://testnet-api.nibgate.xyz';
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || defaultApiBase();

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/ns\/([A-Za-z0-9_-]{1,64})\/?$/);
  const security = pageSecurityHeaders(request, { development: process.env.NODE_ENV !== 'production' });
  const response = NextResponse.next({ request: { headers: security.headers } });
  response.headers.set('Content-Security-Policy', security.csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.headers.set('Cache-Control', 'private, no-store, no-transform');
  if (match) {
    const manifestUrl = `${API_BASE.replace(/\/+$/, '')}/nibshare/${match[1]}/manifest`;
    response.headers.set('Link', `<${manifestUrl}>; rel="alternate"; type="application/json"`);
  }
  return response;
}

export const config = {
  matcher: ['/((?!api/|hub/|auth/|nibshare/|newsletter/|uploads/|app/|rpc$|drnib[^/]*-api/|_next/|.*\\.[^/]+$).*)'],
};
