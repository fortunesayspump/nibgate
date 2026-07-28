import { NextResponse, type NextRequest } from "next/server";
import { subdomainFromHost } from "@/lib/utils";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const subdomain = subdomainFromHost(host);

  if (subdomain) {
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-site-subdomain", subdomain);
    reqHeaders.set("x-forwarded-host", host);
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  const response = NextResponse.next();
  response.headers.set("x-forwarded-host", host);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
