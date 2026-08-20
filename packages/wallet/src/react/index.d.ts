import type { Chain } from 'viem';
import type { ReactNode } from 'react';
import type { Eip1193Provider } from '../index.js';

export interface NibgateWalletOptions {
  projectId?: string;
  rpcUrl?: string;
  chains?: Chain[];
  metadata?: { name: string; description: string; url: string; icons: string[] };
  defaultNetwork?: Chain;
  allowUnsupportedChain?: boolean;
  themeMode?: 'light' | 'dark';
  themeVariables?: Record<string, string>;
  features?: Record<string, boolean>;
}

export function createNibgateWallet(options?: NibgateWalletOptions): {
  appKitNetworks: Chain[];
  projectId: string;
};
export const NIBGATE_APPKIT_PROJECT_ID: string;
export const NIBGATE_RPC_URL: string;

export function NibgateWalletProvider(props: NibgateWalletOptions & { children?: ReactNode }): ReactNode;

export type SiweSigner = (message: string) => Promise<`0x${string}`>;
export function signInWithSiwe(
  address: `0x${string}`,
  signMessage: SiweSigner,
  options?: { authBase?: string; noncePath?: string; verifyPath?: string; headers?: Record<string, string>; domain?: string; uri?: string }
): Promise<{ message: string; signature: `0x${string}`; user?: unknown }>;
export function signMessageWithProvider(
  walletProvider: Eip1193Provider | undefined | null,
  address: string,
  message: string,
): Promise<unknown>;

export const HUB_SESSION_UPDATED_EVENT: string;
export const HUB_SESSION_CLEARED_EVENT: string;
export function shortAddress(address: string): string;
export function getSessionAddress(options?: {
  authBase?: string;
  sessionPath?: string;
  fetchOptions?: RequestInit;
}): Promise<string | null>;

export type NibgateConnectStatus = 'idle' | 'connecting' | 'signing' | 'signed-in' | 'error';
export function useNibgateConnect(options?: {
  authBase?: string;
  noncePath?: string;
  verifyPath?: string;
}): {
  connect: () => Promise<boolean>;
  signIn: () => Promise<boolean>;
  busy: boolean;
  status: NibgateConnectStatus;
  error: string | null;
};

export interface UnlockResource {
  id: string;
  title?: string;
  type?: string;
  price?: string;
  originalPrice?: string | number;
  whitelistPrice?: string | null;
  publicAccess?: boolean;
  currency?: string;
  path?: string;
  recipient?: string;
}

export function useNibgateUnlock(options: {
  resource: UnlockResource;
  accessPath: string;
  gatewayBalanceUrl?: string;
  authBase?: string;
  noncePath?: string;
  verifyPath?: string;
  onUnlock?: (result: { ok: boolean; payload?: unknown; resource?: UnlockResource }) => void;
}): {
  busy: boolean;
  checking: boolean;
  status: string;
  error: string | null;
  unlocked: boolean;
  payload: unknown;
  proof: string;
  address: string | null | undefined;
  disconnect: () => void;
  connect: () => Promise<boolean>;
  unlock: () => Promise<boolean>;
  clear: () => void;
  gatewayBalance: string;
  refreshGatewayBalance: () => Promise<string>;
  walletBalance: string;
  refreshWalletBalance: () => Promise<string>;
  paymentRail: string;
  setPaymentRail: (rail: string) => void;
};

export function NibgateUnlockUI(props: {
  resource: UnlockResource;
  busy: boolean;
  checking: boolean;
  status: string;
  error: string | null;
  unlocked: boolean;
  address?: string | null;
  disconnect?: () => void;
  unlock: () => void;
  connect: () => void;
  gatewayBalance?: string;
  gatewayBalanceUrl?: string;
  walletBalance?: string;
  paymentRail?: string;
  setPaymentRail?: (rail: string) => void;
}): ReactNode;

export function NibgateUnlock(props: {
  resource: UnlockResource;
  accessPath: string;
  gatewayBalanceUrl?: string;
  authBase?: string;
  noncePath?: string;
  verifyPath?: string;
  onUnlock?: (result: { ok: boolean; payload?: unknown; resource?: UnlockResource }) => void;
  children?: ReactNode | ((state: ReturnType<typeof useNibgateUnlock>) => ReactNode);
}): ReactNode;

export function GatewayWalletUI(props: {
  address: string;
  gatewayBalanceUrl?: string;
  onClose?: () => void;
}): ReactNode;

export const NIBGATE_REPUTATION_CHAIN_ID: number;
export const NIBGATE_REPUTATION_CHAIN_NAME: string;
export const NIBGATE_REPUTATION_CONTRACT: `0x${string}`;
export const NIBGATE_REPUTATION_ABI: readonly unknown[];

export interface RatingResource {
  id: string;
  title?: string;
  type?: string;
  price?: string;
  path?: string;
  url?: string;
}

export type NibgateRatingResult = {
  txHash: `0x${string}`;
  walletAddress: `0x${string}` | string;
  contentId: string;
  ratingValue: number;
  reviewHash: string;
};

export function NibgateRatingUI(props: {
  resource: RatingResource;
  contentId?: string;
  statsUrl?: string;
  apiBase?: string;
  indexUrl?: string;
  siteId?: string;
  token?: string;
  unlockRef?: string;
  paymentId?: string;
  onRated?: (result: NibgateRatingResult) => void;
  onError?: (error: unknown) => void;
}): ReactNode;

// Re-exported AppKit primitives (single source so consumers share one AppKit
// instance and never import wagmi / react-query directly).
export {
  createAppKit,
  AppKitProvider,
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useAppKitState,
  useDisconnect,
} from '@reown/appkit/react';
