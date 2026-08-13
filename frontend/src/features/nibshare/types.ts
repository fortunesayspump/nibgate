export interface ShareMeta {
  title: string;
  summary: string | null;
  coverUrl: string | null;
  price: string;
  whitelistPrice: string | null;
  publicAccess: boolean;
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
  whitelistPrice?: string | null;
  publicAccess?: boolean;
  currency: string;
  path: string;
}

export interface Quote {
  wallet: string;
  price: string;
  whitelistPrice: string | null;
  publicAccess: boolean;
  whitelisted: boolean;
  inWhitelist: boolean;
  effectivePrice: string;
  status: "active" | "revoked" | "banned" | null;
  revoked: boolean;
  banned: boolean;
  canUnlock: boolean;
  reason: string | null;
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
  whitelistPrice?: string | null;
  publicAccess?: boolean;
  status: string;
  expiresAt: string | null;
  unlockCount: number;
  viewCount: number;
  storageProvider?: string;
  createdAt: string;
  receipts: ShareReceipt[];
}

export type ShareActivityType = "unlock" | "view" | "revoke" | "ban" | "expiring" | "expired";

export interface ShareActivity {
  key: string;
  type: ShareActivityType;
  title: string;
  slug: string;
  amount?: number;
  wallet?: string | null;
  createdAt: string;
}

export interface EntitlementRecord {
  wallet: string;
  status: "active" | "revoked" | "banned";
  grantedAt: string;
  revokedAt: string | null;
}

export interface ViewerRecord {
  wallet: string;
  count: number;
  lastSeenAt: string;
}

export interface AccessControl {
  whitelist: string[];
  whitelistPrice: string | null;
  publicAccess: boolean;
  entitlements: EntitlementRecord[];
  viewers: ViewerRecord[];
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
  nonce: string;
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
  whitelist?: string[];
  whitelistPrice?: string | null;
  publicAccess?: boolean;
}

export interface CreateShareResponse {
  id: string;
  slug: string;
  url: string;
  title: string;
  price: string;
  whitelistPrice: string | null;
  publicAccess: boolean;
  expiresAt: string | null;
}

export interface AccessPolicyUpdate {
  success: boolean;
  whitelist: string[];
  whitelistPrice: string | null;
  publicAccess: boolean;
  cutOffWallets?: string[];
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
