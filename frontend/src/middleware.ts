import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'https://api.nibgate.xyz' : 'http://localhost:3000');

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/ns\/([A-Za-z0-9_-]{1,64})\/?$/);
  const response = NextResponse.next();
  if (match) {
    const manifestUrl = `${API_BASE.replace(/\/+$/, '')}/nibshare/${match[1]}/manifest`;
    response.headers.set('Link', `<${manifestUrl}>; rel="alternate"; type="application/json"`);
  }
  return response;
}

export const config = {
  matcher: '/ns/:path*',
};
