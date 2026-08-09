import type {
  AccessPayload,
  AuthNonceResponse,
  CreateSharePayload,
  CreateShareResponse,
  MeResponse,
  MineResponse,
  ReslugResponse,
  ShareMeta,
} from "./types";

export const ACCESS_PATH = (slug: string) => `/api/nibshare/${slug}/access`;
export const GATEWAY_BALANCE_PATH = "/api/nibshare/gateway/balance";

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error((data as { error?: string; details?: string }).error || (data as { details?: string }).details || "Request failed") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const nibshareApi = {
  me: () => request<MeResponse>("/api/auth/me", { credentials: "include" }),
  logout: () => request("/api/auth/logout", { method: "POST", credentials: "include" }),
  authNonce: () => request<AuthNonceResponse>("/api/auth/nonce"),
  authVerify: (body: { walletAddress?: string; signature?: string }) =>
    request("/api/auth/verify", { method: "POST", credentials: "include", body: JSON.stringify(body) }),

  meta: (slug: string) => request<ShareMeta>(`/api/nibshare/${slug}/meta`),
  access: (slug: string, proof?: string) =>
    request<AccessPayload>(ACCESS_PATH(slug), {
      headers: proof ? { "x-nibgate-payment-proof": proof } : {},
    }),
  recordView: (slug: string) => request(`/api/nibshare/${slug}/view`, { method: "POST", body: JSON.stringify({}) }),

  create: (payload: CreateSharePayload) =>
    request<CreateShareResponse>("/api/nibshare", { method: "POST", credentials: "include", body: JSON.stringify(payload) }),
  listMine: () => request<MineResponse>("/api/nibshare/mine", { credentials: "include" }),
  revoke: (slug: string) => request(`/api/nibshare/${slug}`, { method: "DELETE", credentials: "include" }),
  reslug: (slug: string) =>
    request<ReslugResponse>(`/api/nibshare/${slug}/reslug`, { method: "POST", credentials: "include" }),
};
