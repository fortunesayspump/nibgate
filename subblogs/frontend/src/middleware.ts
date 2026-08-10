import { NextResponse, type NextRequest } from "next/server";
import { subdomainFromHost } from "@/lib/utils";

const POST_PATH_RE = /^\/(?:writing|photos|music|video|docs|posts)\/[^/]+\/?$/;

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const subdomain = subdomainFromHost(host);

  if (subdomain) {
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-site-subdomain", subdomain);
    reqHeaders.set("x-forwarded-host", host);
    const response = NextResponse.next({ request: { headers: reqHeaders } });

    if (POST_PATH_RE.test(request.nextUrl.pathname)) {
      const path = request.nextUrl.pathname.replace(/\/$/, "");
      const manifestUrl = `https://${host}/api/nibgate/manifest?path=${encodeURIComponent(path)}`;
      response.headers.set("Link", `<${manifestUrl}>; rel="alternate"; type="application/json"`);
    }
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("x-forwarded-host", host);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/feed|.well-known|nibgate.json).*)",
  ],
};
