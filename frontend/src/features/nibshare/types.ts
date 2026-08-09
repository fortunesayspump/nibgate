export interface ShareMeta {
  title: string;
  summary: string | null;
  coverUrl: string | null;
  price: string;
  currency: string;
  contentType: string;
  expiresAt: string | null;
  createdAt: string;
  whitelist: boolean;
  status: string;
}

export interface AccessResource {
  id: string;
  title: string;
  type: string;
  price: string;
  currency: string;
  path: string;
}

export interface AccessPayment {
  id: string | null;
  amount: string;
  currency: string;
  txHash: string | null;
  payerWallet: string;
}

export interface AccessPayload {
  ok: boolean;
  resource: AccessResource;
  content: unknown;
  media: unknown;
  payment: AccessPayment | null;
  unlockProof: string | null;
  expiresInSeconds: number;
}

export interface ShareReceipt {
  id: string;
  amount: number;
  currency?: string;
  payerWallet?: string;
  txHash?: string | null;
  unlockedAt: string;
}

export interface ShareSummary {
  id: string;
  slug: string;
  url: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  contentType: string;
  price: string;
  status: string;
  expiresAt: string | null;
  unlockCount: number;
  viewCount: number;
  storageProvider?: string;
  createdAt: string;
  receipts: ShareReceipt[];
}

export type ShareActivityType = "unlock" | "view" | "revoke" | "expiring" | "expired";

export interface ShareActivity {
  key: string;
  type: ShareActivityType;
  title: string;
  slug: string;
  amount?: number;
  wallet?: string | null;
  createdAt: string;
}

export interface MineResponse {
  shares: ShareSummary[];
  activity: ShareActivity[];
}

export interface MeResponse {
  authenticated: boolean;
  user?: { wallets?: Array<{ address: string }> };
}

export interface AuthNonceResponse {
  messageTemplate: string;
}

export interface CreateSharePayload {
  title: string;
  summary: string;
  coverUrl: string | null;
  contentType: string;
  content: unknown;
  price: string;
  status: "active" | "draft";
  expiresAt: string;
}

export interface CreateShareResponse {
  id: string;
  slug: string;
  url: string;
  title: string;
  price: string;
  expiresAt: string | null;
}

export interface ReslugResponse {
  success: boolean;
  slug: string;
  url: string;
}

export type ContentMedia = {
  url?: string;
  previewUrl?: string;
  storageRef?: string | null;
  encryptedKey?: string | null;
  contentType?: string;
  caption?: string;
  name?: string;
  size?: number;
};
