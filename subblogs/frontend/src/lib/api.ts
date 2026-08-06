import { subdomainFromHost } from "./utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
    "Content-Type": "application/json",
  };

  if (typeof window === "undefined") {
    try {
      const { headers: nextHeaders } = await import("next/headers");
      const h = await nextHeaders();
      const host = h.get("host") || "";
      const subdomain = subdomainFromHost(host);
      if (subdomain) headers["x-site-subdomain"] = subdomain;
      if (host) headers["x-forwarded-host"] = host;
    } catch {}
  } else {
    const host = window.location.hostname;
    const subdomain = subdomainFromHost(host);
    if (subdomain) headers["x-site-subdomain"] = subdomain;
    headers["x-forwarded-host"] = host;
  }

  const res = await fetch(apiUrl(path), { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}

export function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiAuthFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    headers: {
      ...options?.headers as Record<string, string>,
      ...authHeaders(),
    },
  });
}

export type MediaItem = {
  url?: string;
  storageRef?: string | null;
  encryptedKey?: string | null;
  contentType?: string;
  caption?: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  coverUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  audioStorageRef: string | null;
  audioEncryptedKey: string | null;
  audioContentType: string | null;
  documentUrl: string | null;
  documentName: string | null;
  documentSize: number | null;
  documentStorageRef: string | null;
  documentEncryptedKey: string | null;
  documentContentType: string | null;
  media: string | null;
  tag: string;
  tags: string | string[];
  price: string | null;
  type: string;
  status: "draft" | "published";
  featured: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

export type UnlockMediaMeta = {
  hasAudio: boolean;
  audioContentType: string | null;
  photos: number;
  hasVideo: boolean;
  hasDocument: boolean;
  documentName: string | null;
  documentSize: number | null;
  documentContentType: string | null;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};
