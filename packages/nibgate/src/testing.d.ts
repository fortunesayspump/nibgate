import type { NibgatePaymentInput, NibgateServerOptions, NibgateServerResource } from './server.js';

export declare function emitTestEvents(resource: NibgateServerResource | string, options?: NibgateServerOptions & {
  siteId?: string;
  token?: string;
  apiBaseUrl?: string;
  visitorId?: string;
  sessionId?: string;
  source?: string;
  payload?: Record<string, unknown>;
  payment?: NibgatePaymentInput;
  paymentProvider?: string;
  paymentId?: string;
  rating?: number | false;
  walletAddress?: string;
  payer?: string;
  ratingSignature?: string;
  signature?: string;
  reviewHash?: string;
  txHash?: string;
  proofType?: string;
  proof?: string;
}): Promise<Record<string, unknown>>;
