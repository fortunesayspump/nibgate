export type NibgateServerResource = {
  id: string;
  title?: string;
  type?: 'music' | 'video' | 'article' | 'image' | string;
  contentType?: 'music' | 'video' | 'article' | 'image' | string;
  price?: string | number;
  amount?: string | number;
  path?: string;
  route?: string;
  url?: string;
  currency?: string;
  access?: NibgateAccessMode | NibgateAccessPolicy;
  [key: string]: unknown;
};

export type NibgateActor = 'human' | 'agent';
export type NibgateAccessMode = 'free' | 'paid' | 'blocked';
export type NibgateAccessPolicy = {
  humans?: NibgateAccessMode;
  human?: NibgateAccessMode;
  agents?: NibgateAccessMode;
  agent?: NibgateAccessMode;
  default?: NibgateAccessMode;
};

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
  verifyPayment?: (input: { resource: NibgateServerResource; payment: NibgatePaymentInput }) => boolean | Promise<boolean>;
};

export type NibgateUnlockResult =
  | {
      ok: true;
      unlockToken: string;
      cookieName: string;
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
export declare function normalizeAccessPolicy(access?: NibgateAccessMode | NibgateAccessPolicy): Required<Pick<NibgateAccessPolicy, 'humans' | 'agents'>>;
