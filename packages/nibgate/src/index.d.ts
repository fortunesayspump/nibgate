export type NibgateContentType = 'music' | 'video' | 'article' | 'image';
export type NibgateAccessMode = 'free' | 'paid' | 'blocked';
export type NibgateUnlockMode = 'one_time' | 'metered_stream' | 'metered_read' | 'time_pass' | 'agent_quota';
export type NibgateAccessPolicy = {
  humans?: NibgateAccessMode;
  human?: NibgateAccessMode;
  agents?: NibgateAccessMode;
  agent?: NibgateAccessMode;
  default?: NibgateAccessMode;
};
export type NibgateUnlockPolicy = {
  mode?: NibgateUnlockMode | string;
  type?: NibgateUnlockMode | string;
  unit?: string;
  pricePerUnit?: string | number;
  duration?: string | number;
  maxReads?: number;
  [key: string]: unknown;
};

export type NibgateResource = {
  id: string;
  title?: string;
  type?: NibgateContentType | string;
  contentType?: NibgateContentType | string;
  price?: string | number;
  amount?: string | number;
  path?: string;
  route?: string;
  url?: string;
  imageUrl?: string;
  image?: string;
  tags?: string[] | string;
  access?: NibgateAccessMode | NibgateAccessPolicy;
  unlock?: NibgateUnlockMode | NibgateUnlockPolicy;
  [key: string]: unknown;
};

export type NibgatePayment = {
  revenue?: number;
  amount?: number;
  currency?: string;
  paymentId?: string;
  paymentProvider?: 'circle-gateway' | 'arc-testnet' | 'x402' | string;
  receiptUrl?: string;
  txHash?: string;
  chainId?: string | number;
  chainExplorerUrl?: string;
  payer?: string;
  recipient?: string;
  [key: string]: unknown;
};

export type NibgateClient = {
  gate(resource: NibgateResource | string, options?: NibgateGateOptions): NibgateGate;
  content(resource: NibgateResource | string, extra?: Record<string, unknown>): boolean;
  registerContent(resource: NibgateResource | string, extra?: Record<string, unknown>): boolean;
  view(resource: NibgateResource | string, extra?: Record<string, unknown>): boolean;
  track(eventName: string, payload?: Record<string, unknown>): boolean;
  unlockStarted(resource: NibgateResource | string, extra?: Record<string, unknown>): boolean;
  unlockCompleted(resource: NibgateResource | string, payment?: NibgatePayment): boolean;
  paymentCompleted(resource: NibgateResource | string, payment?: NibgatePayment): boolean;
  normalizeResource(resource: NibgateResource | string): NibgateResource;
  normalizeContentType(type?: string): NibgateContentType;
  flush(): boolean;
};

export type NibgateGateOptions = {
  client?: NibgateClient;
};

export type NibgateGate = {
  resource: NibgateResource;
  content(extra?: Record<string, unknown>): boolean;
  view(extra?: Record<string, unknown>): boolean;
  track(eventName: string, payload?: Record<string, unknown>): boolean;
  unlockStarted(extra?: Record<string, unknown>): boolean;
  unlockCompleted(payment?: NibgatePayment): boolean;
  paymentCompleted(payment?: NibgatePayment): boolean;
  isUnlocked(): boolean;
  markUnlocked(payment?: NibgatePayment): boolean;
  unlock(handlerOrPayment?: NibgatePayment | ((resource: NibgateResource) => Promise<NibgatePayment> | NibgatePayment)): Promise<{ unlocked: true; resource: NibgateResource; payment: NibgatePayment }>;
};

export declare const CONTENT_TYPES: readonly ['music', 'video', 'article', 'image'];
export declare const ACCESS_MODES: readonly ['free', 'paid', 'blocked'];
export declare const UNLOCK_MODES: readonly ['one_time', 'metered_stream', 'metered_read', 'time_pass', 'agent_quota'];
export declare function normalizeContentType(type?: string): NibgateContentType;
export declare function normalizeResource(resource?: NibgateResource | string): NibgateResource;
export declare function normalizeAccessPolicy(access?: NibgateAccessMode | NibgateAccessPolicy): Required<Pick<NibgateAccessPolicy, 'humans' | 'agents'>>;
export declare function normalizeUnlockPolicy(unlock?: NibgateUnlockMode | NibgateUnlockPolicy): Required<Pick<NibgateUnlockPolicy, 'mode'>> & NibgateUnlockPolicy;
export declare function createGate(resource: NibgateResource | string, options?: NibgateGateOptions): NibgateGate;
export declare const gate: typeof createGate;
export declare function createNibgate(defaults?: { resource?: NibgateResource }): NibgateClient;
export declare const nibgate: NibgateClient;
