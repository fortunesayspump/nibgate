import { NextRequest, NextResponse } from "next/server";

function subdomainFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return null;
  const parts = h.split(".");
  if (parts.length >= 3 && parts[0] !== "www") return parts[0];
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const host = request.headers.get("host") || "";
    const subdomain = subdomainFromHost(host) || "";
    const res = await fetch(`${apiBase}/nibgate/manifest`, {
      headers: subdomain ? { "x-site-subdomain": subdomain } : {},
      next: { revalidate: 300 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ name: "", content: [] });
  }
}
