const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
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
      ...options?.headers,
      ...authHeaders(),
    },
  });
}

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  coverUrl: string | null;
  tag: string;
  tags: string[];
  price: string | null;
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

export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};
