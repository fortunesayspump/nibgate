import type { Chain } from 'viem';
import type { Address, Hex } from 'viem';

export type ArcTestnetConfig = {
  id: 5042002;
  name: 'Arc Testnet';
  chainIdHex: '0x4CEF52';
  nativeCurrency: { decimals: 18; name: 'USDC'; symbol: 'USDC' };
  rpcUrl: string;
  appRpcUrl: string;
  explorerUrl: string;
};

export type AddArcNetworkParams = {
  chainId: string;
  chainName: string;
  nativeCurrency: { decimals: number; name: string; symbol: string };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export const ARC_TESTNET: ArcTestnetConfig;

export const arcTestnet: Chain;

export function isArcNetwork(chainId: number | undefined | null): boolean;

export function getAddArcNetworkParams(): AddArcNetworkParams;

export const WALLET_ERRORS: {
  rejected: string;
  pending: string;
  unauthorized: string;
  unsupportedChain: string;
  insufficientFunds: string;
  default: string;
};

export function getWalletErrorMessage(
  error: unknown,
  options?: { defaultMessage?: string },
): string;

export function isWalletRejection(error: unknown): boolean;

export const PAYMENT_ERRORS: {
  insufficient_balance: string;
  insufficient_allowance: string;
  expired_challenge: string;
  invalid_price: string;
  invalid_recipient: string;
  unauthorized: string;
  already_used: string;
  invalid_signature: string;
  rate_limited: string;
  default: string;
};

export function getPaymentErrorMessage(
  error: unknown,
  options?: { fallback?: string },
): string;

export type EnsureArcNetworkOptions = {
  currentChainId?: number;
  wait?: boolean;
  timeoutMs?: number;
  onSwitch?: () => void;
};

export type EnsureArcNetworkResult = {
  switched: boolean;
  chainId: number;
};

export function ensureArcNetwork(
  provider: Eip1193Provider,
  options?: EnsureArcNetworkOptions,
): Promise<EnsureArcNetworkResult>;

export function switchToArcNetwork(provider: Eip1193Provider): Promise<void>;

export function waitForChainChange(
  provider: Eip1193Provider,
  options?: { chainId?: number; timeoutMs?: number },
): Promise<void>;

export const SIGN_IN_STATEMENT: string;

export type SignInMessageParams = {
  address: Address;
  chainId?: number;
  nonce: string;
  domain: string;
  uri: string;
  issuedAt?: Date;
  expirationTime?: Date;
};

export type ParsedSignInMessage = {
  address: Address;
  chainId: number;
  domain: string;
  uri: string;
  version: string;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
  statement?: string;
  scheme?: string;
};

export type ValidateSignInMessageExpected = {
  address?: Address;
  chainId?: number;
  domain?: string;
  nonce?: string;
  scheme?: string;
  time?: Date;
};

export function createSignInNonce(): string;

export function createSignInMessage(params: SignInMessageParams): string;

export function parseSignInMessage(message: string): ParsedSignInMessage | null;

export function validateSignInMessage(parameters: {
  message: string | ParsedSignInMessage;
  expected?: ValidateSignInMessageExpected;
}): boolean;

export function verifySignature(parameters: {
  message: string;
  signature: Hex;
  address: Address;
}): Promise<boolean>;
