import { headers } from "next/headers";
import { subdomainFromHost } from "./utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function serverFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const h = await headers();
  const host = h.get("host") || "";
  const subdomain = subdomainFromHost(host);
  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (subdomain) reqHeaders["x-site-subdomain"] = subdomain;
  if (host) reqHeaders["x-forwarded-host"] = host;

  const res = await fetch(apiUrl(path), { ...options, headers: { ...options?.headers as Record<string, string>, ...reqHeaders } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}
