import { headers } from "next/headers";
import { subdomainFromHost } from "./utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function serverFetch<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const h = await headers();
    // Use the x-site-subdomain set by middleware, fall back to extracting from host
    let subdomain = h.get("x-site-subdomain") || "";
    if (!subdomain) {
      const host = h.get("host") || "";
      subdomain = subdomainFromHost(host) || "";
    }
    const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (subdomain) reqHeaders["x-site-subdomain"] = subdomain;

    const res = await fetch(apiUrl(path), { ...options, headers: { ...options?.headers as Record<string, string>, ...reqHeaders } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Request failed");
    return data;
  } catch {
    return {} as T;
  }
}
