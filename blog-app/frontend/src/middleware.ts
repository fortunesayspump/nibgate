import { NextResponse, type NextRequest } from "next/server";

function subdomainFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return null;
  const parts = h.split(".");
  if (parts.length >= 3 && parts[0] !== "www") return parts[0];
  return null;
}

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
