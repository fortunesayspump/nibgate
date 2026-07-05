export type NibgateContentType = 'music' | 'video' | 'article' | 'image';
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

export type NibgateResource = {
  id: string;
  title?: string;
  type?: NibgateContentType | string;
  contentType?: NibgateContentType | string;
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
  access?: NibgateAccessMode | NibgateAccessPolicy;
  unlock?: NibgateUnlockMode | NibgateUnlockPolicy;
  [key: string]: unknown;
};

export type NibgateMetadataValidation = {
  ok: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  resource: NibgateResource;
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

export type NibgateRating = {
  rating?: number;
  stars?: number;
  ratingValue?: number;
  score?: number;
  walletAddress?: string;
  payer?: string;
  actor?: 'human' | 'agent' | string;
  paymentId?: string;
  txHash?: string;
  reviewHash?: string;
  message?: string;
  ratingMessage?: string;
  signature?: string;
  ratingSignature?: string;
  proofType?: 'onchain' | 'attested' | string;
  proof?: string;
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
  rateResource(resource: NibgateResource | string, rating?: NibgateRating | number, extra?: Record<string, unknown>): boolean;
  trackResourcePage(resource: NibgateResource | string, options?: NibgatePageOptions): NibgateGate;
  checkResourceAccess(resource: NibgateResource | string, options?: NibgateAccessCheckOptions): Promise<NibgateAccessCheckResult>;
  payWithPaymentSignature(resource: NibgateResource | string, options?: NibgatePaymentSignatureOptions): Promise<NibgatePaymentSignatureResult>;
  createWalletCheckout(resource: NibgateResource | string, options: NibgateWalletCheckoutOptions): NibgateWalletCheckoutController;
  createCircleGatewayBrowserAdapter(options: NibgateCircleGatewayBrowserAdapterOptions): Promise<NibgateCircleGatewayBrowserAdapter>;
  createTransferCheckout(resource: NibgateResource | string, options: NibgateTransferCheckoutOptions): NibgateTransferCheckout;
  payWithTransfer(resource: NibgateResource | string, options: NibgateTransferCheckoutOptions & NibgateAccessCheckOptions): Promise<NibgateAccessCheckResult>;
  createEvmGatewayUnlock(resource: NibgateResource | string, options?: NibgateEvmGatewayUnlockOptions): NibgateEvmGatewayUnlockController;
  rateContentOnchain(resource: NibgateResource | string, options: NibgateOnchainRatingOptions): Promise<NibgateOnchainRatingResult>;
  createOnchainRating(resource: NibgateResource | string, options?: NibgateOnchainRatingUiOptions): NibgateOnchainRatingController;
  payAndUnlockResource(resource: NibgateResource | string, options?: NibgatePaymentOptions): Promise<NibgatePaymentResult>;
  setupResourcePage(resource: NibgateResource | string, options?: NibgatePageSetupOptions): NibgateGate;
  ratingMessage(resource: NibgateResource | string, rating?: NibgateRating | number, options?: Record<string, unknown>): string;
  normalizeResource(resource: NibgateResource | string): NibgateResource;
  validateResourceMetadata(resource: NibgateResource | string, options?: Record<string, unknown>): NibgateMetadataValidation;
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
  rate(rating?: NibgateRating | number, extra?: Record<string, unknown>): boolean;
};

export type NibgatePageOptions = {
  source?: string;
  path?: string;
  referrer?: string;
  content?: Record<string, unknown>;
  view?: Record<string, unknown>;
  gateOptions?: NibgateGateOptions;
};

export type NibgateAccessCheckOptions = {
  source?: string;
  accessPath?: string;
  payPath?: string;
  autoPay?: boolean;
  retryAfterPay?: boolean;
  paymentSignature?: string;
  paymentRequiredHeader?: string;
  memo?: string;
  checkout?: NibgateCheckoutHandler;
  createPaymentSignature?: NibgateCheckoutHandler;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  payment?: NibgatePayment;
  paymentProvider?: string;
  checkingMessage?: string;
  challengeMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  gateOptions?: NibgateGateOptions;
  onStatus?: (message: string) => void;
};

export type NibgateCheckoutInput = {
  resource: NibgateResource;
  challenge?: Record<string, unknown> | null;
  paymentRequiredHeader?: string;
  accessPath?: string;
};

export type NibgateCheckoutResult = {
  paymentSignature?: string;
  signature?: string;
  payment?: string | NibgatePayment;
  memo?: string;
  paymentMemo?: string;
  metadata?: NibgatePayment;
  paymentMetadata?: NibgatePayment;
  [key: string]: unknown;
};

export type NibgateCheckoutHandler = (input: NibgateCheckoutInput) => Promise<NibgateCheckoutResult> | NibgateCheckoutResult;

export type NibgateEvmTypedDataSigner = {
  address: `0x${string}` | string;
  signTypedData(params: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}` | string;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}` | string>;
};

export type NibgateCircleGatewayBrowserAdapterOptions = {
  signer?: NibgateEvmTypedDataSigner;
  getSigner?: () => Promise<NibgateEvmTypedDataSigner> | NibgateEvmTypedDataSigner;
  network?: string;
  chainId?: number | string;
  clientModule?: Record<string, unknown>;
  clientModuleUrl?: string;
};

export type NibgateCircleGatewayBrowserAdapter = {
  signer: NibgateEvmTypedDataSigner;
  network: string;
  pay(input: NibgateCheckoutInput): Promise<NibgateCheckoutResult>;
};

export type NibgateEvmGatewayUnlockOptions = {
  source?: string;
  accessPath?: string;
  network?: string;
  paymentProvider?: string;
  circleClientModule?: Record<string, unknown>;
  circleClientModuleUrl?: string;
  provider?: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  };
  connectButton?: string | Element | null;
  disconnectButton?: string | Element | null;
  unlockButton?: string | Element | null;
  clearButton?: string | Element | null;
  walletLabel?: string | Element | null;
  status?: string | Element | null;
  unlockedTarget?: string | Element | null;
  noWalletMessage?: string;
  challengeMessage?: string;
  paymentMessage?: string;
  successMessage?: string;
  disconnectMessage?: string;
  autoMount?: boolean;
  gateOptions?: NibgateGateOptions;
  onStatus?: (message: string) => void;
  onUnlock?: (result: NibgateAccessCheckResult) => void;
};

export type NibgateEvmGatewayUnlockController = {
  resource: NibgateResource;
  connect(): Promise<string>;
  disconnect(): Promise<boolean>;
  unlock(): Promise<NibgateAccessCheckResult | { ok: false; status: number; error: string; resource: NibgateResource }>;
  clear(): void;
  hydrate(): Promise<void>;
  mount(): NibgateEvmGatewayUnlockController;
  getWalletAddress(): string;
};

export type NibgateWalletCheckoutOptions = NibgateAccessCheckOptions & {
  button?: string | HTMLButtonElement | null;
  status?: string | HTMLElement | null;
  pay?: NibgateCheckoutHandler;
};

export type NibgateWalletCheckoutController = {
  resource: NibgateResource;
  unlock(extra?: Partial<NibgateWalletCheckoutOptions>): Promise<NibgateAccessCheckResult | NibgatePaymentSignatureResult>;
  mount(): { unlock(extra?: Partial<NibgateWalletCheckoutOptions>): Promise<NibgateAccessCheckResult | NibgatePaymentSignatureResult> };
};

export type NibgatePaymentSignatureOptions = NibgateAccessCheckOptions & {
  challenge?: Record<string, unknown> | null;
  payment?: NibgatePayment;
};

export type NibgatePaymentOptions = {
  source?: string;
  payPath?: string;
  payMethod?: string;
  payHeaders?: Record<string, string>;
  payPayload?: Record<string, unknown>;
  paymentProvider?: string;
  paymentMessage?: string;
  paymentSuccessMessage?: string;
  paymentErrorMessage?: string;
  gateOptions?: NibgateGateOptions;
  onStatus?: (message: string) => void;
};

export type NibgatePageSetupOptions = NibgatePageOptions & NibgateAccessCheckOptions & {
  button?: string | HTMLButtonElement | null;
  status?: string | HTMLElement | null;
};

export type NibgateAccessCheckResult =
  | { ok: true; status: number; payload: Record<string, unknown>; payment: NibgatePayment | null; resource: NibgateResource; response: Response }
  | { ok: false; status: number; challenge?: Record<string, unknown>; error?: string; payload?: Record<string, unknown>; resource: NibgateResource; response: Response };

export type NibgatePaymentResult =
  | { ok: true; status: number; payload: Record<string, unknown>; payment: NibgatePayment; resource: NibgateResource; response: Response }
  | { ok: false; status: number; payload?: Record<string, unknown>; resource: NibgateResource; response: Response };

export type NibgatePaymentSignatureResult =
  | { ok: true; status: number; payload: Record<string, unknown>; payment: NibgatePayment; resource: NibgateResource; response: Response }
  | { ok: false; status: number; error?: string; payload?: Record<string, unknown>; resource: NibgateResource; response?: Response };

export type NibgateOnchainRatingOptions = NibgateRating & {
  provider?: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  };
  contractAddress?: string;
  reputationContract?: string;
  siteDomain?: string;
  domain?: string;
  url?: string;
  contentId?: `0x${string}` | string;
  unlockRef?: string;
  review?: string;
  reviewHash?: string;
  paymentId?: string;
  actor?: 'human' | 'agent' | string;
  source?: string;
  prepareUrl?: string;
  indexUrl?: string;
  indexHeaders?: Record<string, string>;
  siteId?: string;
  token?: string;
};

export type NibgateOnchainRatingResult = {
  txHash: string;
  walletAddress: string;
  contentId: string;
  ratingValue: number;
  reviewHash: string;
};

export type NibgateOnchainRatingUiOptions = NibgateOnchainRatingOptions & {
  status?: string | HTMLElement | null;
  ratingTarget?: string | HTMLElement | null;
  ratingButtons?: string;
  buttons?: string | HTMLElement | HTMLElement[] | null;
  payment?: NibgatePayment | null;
  visible?: boolean;
  autoMount?: boolean;
  pendingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  gateOptions?: NibgateGateOptions;
  getPaymentId?: () => string | undefined | null;
  getUnlockRef?: () => string | undefined | null;
  onStatus?: (message: string) => void;
  onRated?: (result: NibgateOnchainRatingResult) => void;
  onError?: (error: unknown) => void;
};

export type NibgateOnchainRatingController = {
  resource: NibgateResource;
  rate(input?: Partial<NibgateOnchainRatingOptions> & { value?: number | string }): Promise<NibgateOnchainRatingResult>;
  mount(): NibgateOnchainRatingController;
  setPayment(payment?: NibgatePayment | null): NibgatePayment | null;
  setVisible(isVisible: boolean): boolean;
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
  type: NibgateContentType;
  humanAccess: NibgateAccessMode;
  agentAccess: NibgateAccessMode;
  unlockMode: NibgateUnlockMode | string;
  paymentRail: NibgatePaymentRail | string;
  price: string;
  currency: string;
  recipient: string;
  license: string;
};
export declare const NIBGATE_CONTENT_SETTING_FIELDS: readonly NibgateContentSettingField[];
export declare function createNibgateContentSettings(input?: Record<string, unknown>): NibgateContentSettings;
export declare function settingsToAccessPolicy(settings?: Partial<NibgateContentSettings>): Required<Pick<NibgateAccessPolicy, 'humans' | 'agents'>>;
export declare function settingsToUnlockPolicy(settings?: Partial<NibgateContentSettings>): Required<Pick<NibgateUnlockPolicy, 'mode'>> & NibgateUnlockPolicy;

export declare const PAYMENT_RAILS: readonly ['gateway', 'transfer'];
export declare function normalizePaymentRail(value?: string, fallback?: NibgatePaymentRail): NibgatePaymentRail;
export declare const CONTENT_TYPES: readonly ['music', 'video', 'article', 'image'];
export declare const ACCESS_MODES: readonly ['free', 'paid', 'blocked'];
export declare const UNLOCK_MODES: readonly ['one_time', 'metered_stream', 'metered_read', 'time_pass', 'agent_quota'];
export declare function normalizeContentType(type?: string): NibgateContentType;
export declare function normalizeResource(resource?: NibgateResource | string): NibgateResource;
export declare function validateResourceMetadata(resource?: NibgateResource | string, options?: Record<string, unknown>): NibgateMetadataValidation;
export declare function normalizeAccessPolicy(access?: NibgateAccessMode | NibgateAccessPolicy): Required<Pick<NibgateAccessPolicy, 'humans' | 'agents'>>;
export declare function normalizeUnlockPolicy(unlock?: NibgateUnlockMode | NibgateUnlockPolicy): Required<Pick<NibgateUnlockPolicy, 'mode'>> & NibgateUnlockPolicy;
export declare function createGate(resource: NibgateResource | string, options?: NibgateGateOptions): NibgateGate;
export declare const gate: typeof createGate;
export declare function trackResourcePage(resource: NibgateResource | string, options?: NibgatePageOptions): NibgateGate;
export declare function checkResourceAccess(resource: NibgateResource | string, options?: NibgateAccessCheckOptions): Promise<NibgateAccessCheckResult>;
export declare function clearPaymentProof(resource: NibgateResource | string): boolean;
export declare function payWithPaymentSignature(resource: NibgateResource | string, options?: NibgatePaymentSignatureOptions): Promise<NibgatePaymentSignatureResult>;
export declare function createWalletCheckout(resource: NibgateResource | string, options: NibgateWalletCheckoutOptions): NibgateWalletCheckoutController;
export declare function createCircleGatewayBrowserAdapter(options: NibgateCircleGatewayBrowserAdapterOptions): Promise<NibgateCircleGatewayBrowserAdapter>;
export declare function createEvmGatewayUnlock(resource: NibgateResource | string, options?: NibgateEvmGatewayUnlockOptions): NibgateEvmGatewayUnlockController;
export declare function payAndUnlockResource(resource: NibgateResource | string, options?: NibgatePaymentOptions): Promise<NibgatePaymentResult>;
export declare function setupResourcePage(resource: NibgateResource | string, options?: NibgatePageSetupOptions): NibgateGate;
export declare function rateResource(resource: NibgateResource | string, rating?: NibgateRating | number, extra?: Record<string, unknown>): boolean;
export declare const NIBGATE_REPUTATION_ABI: readonly unknown[];
export declare const NIBGATE_CONTENT_HASH_NAMESPACE: 'nibgate:content:v1';
export declare const NIBGATE_REPUTATION_CHAIN_ID: 5042002;
export declare const NIBGATE_REPUTATION_CHAIN_NAME: 'Arc Testnet';
export declare const NIBGATE_REPUTATION_RPC_URL: 'https://rpc.testnet.arc.network';
export declare const NIBGATE_REPUTATION_CONTRACT: '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
export declare function contentRatingHash(resource: NibgateResource | string, options?: Record<string, unknown>): string;
export declare function reviewTextHash(review?: string): string;
export declare function rateContentOnchain(resource: NibgateResource | string, options: NibgateOnchainRatingOptions): Promise<NibgateOnchainRatingResult>;
export declare function createOnchainRating(resource: NibgateResource | string, options?: NibgateOnchainRatingUiOptions): NibgateOnchainRatingController;
export declare function ratingMessage(resource: NibgateResource | string, rating?: NibgateRating | number, options?: Record<string, unknown>): string;
export declare function createNibgate(defaults?: { resource?: NibgateResource }): NibgateClient;
export declare const nibgate: NibgateClient;

export declare function createTransferCheckout(resource: NibgateResource | string, options: NibgateTransferCheckoutOptions): NibgateTransferCheckout;
export declare function payWithTransfer(resource: NibgateResource | string, options: NibgateTransferCheckoutOptions & NibgateAccessCheckOptions): Promise<NibgateAccessCheckResult>;
