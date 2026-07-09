export type NibgateServerResource = {
  id: string;
  title?: string;
  type?: 'music' | 'video' | 'article' | 'image' | string;
  contentType?: 'music' | 'video' | 'article' | 'image' | string;
  price?: string | number;
  paymentRail?: NibgatePaymentRail | string;
  amount?: string | number;
  recipient?: string;
  receiver?: string;
  receiverAddress?: string;
  payTo?: string;
  creatorWallet?: string;
  path?: string;
  route?: string;
  url?: string;
  imageUrl?: string;
  image?: string;
  description?: string;
  summary?: string;
  tags?: readonly string[] | string;
  currency?: string;
  access?: NibgateAccessMode | NibgateAccessPolicy;
  unlock?: NibgateUnlockMode | NibgateUnlockPolicy;
  ratingsEnabled?: boolean;
  enableRatings?: boolean;
  reputation?: {
    ratingsEnabled?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type NibgateMetadataValidation = {
  ok: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  resource: NibgateServerResource;
};

export type NibgateActor = 'human' | 'agent';
export type NibgateAccessMode = 'free' | 'paid' | 'blocked';
export type NibgateUnlockMode = 'one_time' | 'metered_stream' | 'metered_read' | 'time_pass' | 'agent_quota';
export type NibgatePaymentRail = 'gateway' | 'transfer';
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


export type NibgateContentSettingField = {
  name: string;
  label: string;
  type: 'boolean' | 'select' | 'text' | 'wallet' | 'textarea' | string;
  options?: readonly string[];
  defaultValue?: string | boolean;
};
export type NibgateContentSettings = {
  publishToNibgate: boolean;
  type: 'music' | 'video' | 'article' | 'image';
  humanAccess: NibgateAccessMode;
  agentAccess: NibgateAccessMode;
  unlockMode: NibgateUnlockMode | string;
  paymentRail: NibgatePaymentRail | string;
  price: string;
  currency: string;
  recipient: string;
  ratingsEnabled: boolean;
  license: string;
};
export declare const NIBGATE_CONTENT_SETTING_FIELDS: readonly NibgateContentSettingField[];
export declare function createNibgateContentSettings(input?: Record<string, unknown>): NibgateContentSettings;
export declare function settingsToAccessPolicy(settings?: Partial<NibgateContentSettings>): Required<Pick<NibgateAccessPolicy, 'humans' | 'agents'>>;
export declare function settingsToUnlockPolicy(settings?: Partial<NibgateContentSettings>): Required<Pick<NibgateUnlockPolicy, 'mode'>> & NibgateUnlockPolicy;

export declare const PAYMENT_RAILS: readonly ['gateway', 'transfer'];
export declare function normalizePaymentRail(value?: string, fallback?: NibgatePaymentRail): NibgatePaymentRail;
export declare const UNLOCK_MODES: readonly ['one_time', 'metered_stream', 'metered_read', 'time_pass', 'agent_quota'];

export type NibgatePaymentInput = {
  id?: string;
  paymentId?: string;
  paymentProvider?: 'circle-gateway' | 'arc-testnet' | 'x402' | string;
  receiptUrl?: string;
  txHash?: string;
  chainId?: string | number;
  chainExplorerUrl?: string;
  payer?: string;
  recipient?: string;
  actor?: string;
  expiresInSeconds?: number;
  [key: string]: unknown;
};

export type NibgateServerOptions = {
  secret?: string;
  origin?: string;
  paymentMode?: string;
  network?: string;
  recipient?: string;
  expiresInSeconds?: number;
  actor?: NibgateActor;
  defaultActor?: NibgateActor;
  paymentRail?: NibgatePaymentRail | string;
  verifyPayment?: (input: { resource: NibgateServerResource; payment: NibgatePaymentInput }) => boolean | Promise<boolean>;
  verifyTransfer?: (input: { resource: NibgateServerResource; txHash: string; payment: NibgatePaymentInput; request: Request }) => boolean | Promise<boolean>;
};

export type NibgateUnlockResult =
  | {
      ok: true;
      unlockProof: string;
      expiresInSeconds: number;
      resource: NibgateServerResource;
      payment: NibgatePaymentInput;
    }
  | {
      ok: false;
      status: 402;
      error: string;
      challenge: Record<string, unknown>;
    };

export declare function createUnlockToken(resource: NibgateServerResource | string, options?: NibgateServerOptions & NibgatePaymentInput): string;
export declare function verifyUnlockToken(token: string, resource: NibgateServerResource | string, options?: NibgateServerOptions): Record<string, unknown> | null;
export declare function createPaymentChallenge(resource: NibgateServerResource | string, options?: NibgateServerOptions): Record<string, unknown>;
export declare function createManifest(input?: { name?: string; origin?: string; content?: Array<NibgateServerResource | string>; resources?: Array<NibgateServerResource | string> }): Record<string, unknown>;
export declare function manifestResponse(input?: { name?: string; origin?: string; content?: Array<NibgateServerResource | string>; resources?: Array<NibgateServerResource | string> }): Response;
export declare function emitHubEvent(event: string, resource: NibgateServerResource | string, options?: NibgateServerOptions & {
  siteId?: string;
  token?: string;
  apiBaseUrl?: string;
  headers?: Record<string, string>;
  visitorId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
}): Promise<Record<string, unknown>>;
export declare function payWithGateway(resource: NibgateServerResource | string, options?: NibgateServerOptions & {
  accessUrl?: string;
  accessPath?: string;
  buyerPrivateKey?: string;
  buyerChain?: string;
  buyerRpcUrl?: string;
}): Promise<Record<string, unknown>>;
export declare function createGatewayBuyer(options?: NibgateServerOptions & {
  buyerPrivateKey?: string;
  buyerChain?: string;
  buyerRpcUrl?: string;
}): Promise<Record<string, unknown>>;
export declare function getGatewayBalances(options?: NibgateServerOptions & {
  buyerPrivateKey?: string;
  buyerChain?: string;
  buyerRpcUrl?: string;
  address?: string;
}): Promise<Record<string, unknown>>;
export declare function depositToGateway(amount: string | number, options?: NibgateServerOptions & {
  buyerPrivateKey?: string;
  buyerChain?: string;
  buyerRpcUrl?: string;
  depositOptions?: Record<string, unknown>;
}): Promise<Record<string, unknown>>;
export declare function withdrawFromGateway(amount: string | number, options?: NibgateServerOptions & {
  buyerPrivateKey?: string;
  buyerChain?: string;
  buyerRpcUrl?: string;
  chain?: string;
  recipient?: string;
  maxFee?: string;
  withdrawOptions?: Record<string, unknown>;
}): Promise<Record<string, unknown>>;
export declare function circleGatewayOptions(options?: NibgateServerOptions): NibgateServerOptions & { paymentMode: string; network: string };
export declare function createCircleGatewayServer(options?: NibgateServerOptions): ReturnType<typeof createNibgateServer>;
export declare function createNibgateServer(options?: NibgateServerOptions): {
  unlock(resource: NibgateServerResource | string, payment?: NibgatePaymentInput): Promise<NibgateUnlockResult>;
  isUnlocked(request: Request, resource: NibgateServerResource | string, options?: { actor?: NibgateActor }): boolean;
  accessFor(request: Request, resource: NibgateServerResource | string, options?: { actor?: NibgateActor; defaultActor?: NibgateActor }): {
    actor: NibgateActor;
    mode: NibgateAccessMode;
    unlocked: boolean;
    allowed: boolean;
    blocked: boolean;
    paid: boolean;
    resource: NibgateServerResource;
  };
  protect(resource: NibgateServerResource | string, handler: (request: Request, context?: unknown) => Response | Promise<Response>, routeOptions?: NibgateServerOptions): (request: Request, context?: unknown) => Promise<Response>;
  accessResponse(request: Request, resource: NibgateServerResource | string, allowedBody?: Record<string, unknown> | ((input: { access: Record<string, unknown>; resource: NibgateServerResource }) => Record<string, unknown> | Response) | null, routeOptions?: NibgateServerOptions): Promise<Response>;
  payAndUnlockResponse(request: Request, resource: NibgateServerResource | string, routeOptions?: NibgateServerOptions & { accessUrl?: string; accessPath?: string }): Promise<Response>;
  manifest(input?: { name?: string; origin?: string; content?: Array<NibgateServerResource | string>; resources?: Array<NibgateServerResource | string> }): Record<string, unknown>;
  manifestResponse(input?: { name?: string; origin?: string; content?: Array<NibgateServerResource | string>; resources?: Array<NibgateServerResource | string> }): Response;
  emitHubEvent(event: string, resource: NibgateServerResource | string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  getGatewayBalances(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  depositToGateway(amount: string | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  withdrawFromGateway(amount: string | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  createPaymentChallenge(resource: NibgateServerResource | string, options?: NibgateServerOptions): Record<string, unknown>;
  createUnlockToken(resource: NibgateServerResource | string, options?: NibgateServerOptions & NibgatePaymentInput): string;
  verifyUnlockToken(token: string, resource: NibgateServerResource | string): Record<string, unknown> | null;
  actorFromRequest(request: Request, fallback?: NibgateActor): NibgateActor;
  accessModeFor(resource: NibgateServerResource | string, actor?: NibgateActor): NibgateAccessMode;
};
export declare function protect(resource: NibgateServerResource | string, handler: (request: Request, context?: unknown) => Response | Promise<Response>, options?: NibgateServerOptions): (request: Request, context?: unknown) => Promise<Response>;
export declare const server: ReturnType<typeof createNibgateServer>;
export declare function actorFromRequest(request: Request, fallback?: NibgateActor): NibgateActor;
export declare function accessModeFor(resource: NibgateServerResource | string, actor?: NibgateActor): NibgateAccessMode;
export declare function normalizeResource(resource?: NibgateServerResource | string): NibgateServerResource;
export declare function validateResourceMetadata(resource?: NibgateServerResource | string, options?: Record<string, unknown>): NibgateMetadataValidation;
export declare function normalizeAccessPolicy(access?: NibgateAccessMode | NibgateAccessPolicy): Required<Pick<NibgateAccessPolicy, 'humans' | 'agents'>>;
export declare function normalizeUnlockPolicy(unlock?: NibgateUnlockMode | NibgateUnlockPolicy): Required<Pick<NibgateUnlockPolicy, 'mode'>> & NibgateUnlockPolicy;

// Admin API
export interface NibgateAdminStore {
  list(): Record<string, unknown>[];
  get(id: string): Record<string, unknown> | null;
  set(id: string, settings: Record<string, unknown>): Record<string, unknown>;
  remove(id: string): boolean;
}
export interface NibgateAdminApi {
  handleList(req: Request, res: Record<string, unknown>): Promise<Response>;
  handleGet(req: Request, res: Record<string, unknown>): Promise<Response>;
  handleUpdate(req: Request, res: Record<string, unknown>): Promise<Response>;
  handleDelete(req: Request, res: Record<string, unknown>): Promise<Response>;
  buildResourceFromSettings(id: string, settings: Record<string, unknown>): NibgateServerResource;
  router(expressModule: Record<string, unknown>): unknown;
  store: NibgateAdminStore;
  settingsFields: Record<string, unknown>[];
}
export declare function createAdminApi(options: { store: NibgateAdminStore; title?: string; authorize?: (req: Request) => boolean }): NibgateAdminApi;
export declare function createFileStore(options?: { path?: string }): NibgateAdminStore;
export declare function createMemoryStore(): NibgateAdminStore;
export declare function adminPageHtml(options?: { title?: string; apiBase?: string }): string;
