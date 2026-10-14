import type { Eip1193Provider } from './index.js';

export class GatewayTransferError extends Error {}
export interface GatewayTransferRecord {
  chainId: number;
  address: string;
  gateway: string;
  usdc: string;
  kind: 'deposit' | 'withdraw';
  amount: string;
  status: 'pending' | 'confirmed' | 'reverted';
  submitting: 'approval' | 'transfer' | null;
  approvalHash: string | null;
  transferHash: string | null;
}
export interface GatewayTransferStore {
  read(key: string): GatewayTransferRecord | null;
  write(key: string, value: GatewayTransferRecord): void;
  clear(key: string): void;
}
export function parseGatewayAmount(value: string | number): bigint;
export function gatewayTransferKey(input: { chainId: number; gateway: string; address: string }): string;
export function createGatewayTransferStore(getStorage: () => { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }): GatewayTransferStore;
export function clearGatewayTransfer(input: { store: GatewayTransferStore; key: string }): void;
export function runGatewayTransfer(input: {
  provider: Eip1193Provider;
  address: string;
  kind: 'deposit' | 'withdraw';
  amount: string;
  chainId: number;
  gateway: string;
  usdc: string;
  store: GatewayTransferStore;
  ensureNetwork(provider: Eip1193Provider, options: { assertActive(): void }): Promise<unknown>;
  checkConnection(provider: Eip1193Provider, options: { assertActive(): void }): Promise<unknown>;
  waitForReceipt(hash: string): Promise<unknown>;
  getTransaction(hash: string): Promise<unknown>;
  assertActive(): void;
  onUpdate?(record: GatewayTransferRecord, message?: string): void;
}): Promise<GatewayTransferRecord>;
