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

export const ACCESS_PATH = (slug: string) => `/nibshare/${slug}/access`;
export const GATEWAY_BALANCE_PATH = "/nibshare/gateway/balance";

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
  me: () => request<MeResponse>("/auth/me", { credentials: "include" }),
  logout: () => request("/auth/logout", { method: "POST", credentials: "include" }),
  authNonce: () => request<AuthNonceResponse>("/auth/nonce", { credentials: "include" }),
  authVerify: (body: { message: string; signature: `0x${string}` }) =>
    request("/auth/verify", { method: "POST", credentials: "include", body: JSON.stringify(body) }),

  meta: (slug: string) => request<ShareMeta>(`/nibshare/${slug}/meta`),
  access: (slug: string, proof?: string) =>
    request<AccessPayload>(ACCESS_PATH(slug), {
      headers: proof ? { "x-nibgate-payment-proof": proof } : {},
    }),
  recordView: (slug: string) => request(`/nibshare/${slug}/view`, { method: "POST", body: JSON.stringify({}) }),

  create: (payload: CreateSharePayload) =>
    request<CreateShareResponse>("/nibshare", { method: "POST", credentials: "include", body: JSON.stringify(payload) }),
  listMine: () => request<MineResponse>("/nibshare/mine", { credentials: "include" }),
  revoke: (slug: string) => request(`/nibshare/${slug}`, { method: "DELETE", credentials: "include" }),
  reslug: (slug: string) =>
    request<ReslugResponse>(`/nibshare/${slug}/reslug`, { method: "POST", credentials: "include" }),
};
