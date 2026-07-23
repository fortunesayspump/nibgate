import { NextResponse, type NextRequest } from "next/server";
import { subdomainFromHost } from "@/lib/utils";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const subdomain = subdomainFromHost(host);

  const response = NextResponse.next();

  if (subdomain) {
    response.headers.set("x-site-subdomain", subdomain);
  }

  response.headers.set("x-forwarded-host", host);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
