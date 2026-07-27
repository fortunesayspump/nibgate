import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const subdomain = request.headers.get("x-site-subdomain") || "";
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
