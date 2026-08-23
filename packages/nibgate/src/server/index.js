import { createNibgateServer } from './access.js';

export { normalizeWalletAddress, normalizeWhitelist, isPaidValue, isWhitelisted, inWhitelist, effectivePrice, accessDecision, canAccess, hasPaidReceipt, paidCutoffWallets } from './access-policy.js';
export { actorFromRequest, accessModeFor } from './actor.js';
export { createPaymentChallenge } from './challenge.js';
export { createManifest, manifestResponse } from './manifest.js';
export { createUnlockToken, verifyUnlockToken } from './proof.js';
export { ownershipMessage } from '../core/ownership.js';
export { OWNERSHIP_SIGNATURE_HEADER, verifyOwnershipSignature } from './ownership.js';
export { emitHubEvent } from './hub.js';
export { payWithGateway, createGatewayBuyer, getGatewayBalances, depositToGateway, withdrawFromGateway, runCircleGatewayRequirement } from './gateway.js';
export { transferOwnershipMessage, feePolicy, protocolFeeFor, feeWalletAddressFor, createPredictedWalletReader, ensureFeeWalletDeployed, resolvePayTo, runHostedPayRequirement, runHostedTransferRequirement, createTransferVerifier, FEE_WALLET_FACTORY_ABI, DEFAULT_TREASURY, DEFAULT_FEE_BPS, DEFAULT_MAX_FEE_BPS, ARC_TESTNET_CHAIN, ARC_TESTNET_RPC, ARC_USDC, ARC_GATEWAY_WALLET, ARC_GATEWAY_MINTER, ARC_DOMAIN, GATEWAY_API_TESTNET, buildSelfBurnIntent, submitGatewayWithdrawal, gatewayBalanceFor, feeWalletUsdcBalance, withdrawGatewayBalanceFor, distributeFeeWallet, sweepFeeWallet } from './fee-wallet.js';
export { createNibgateServer, protect, verifyPayment } from './access.js';
export { circleGatewayOptions, createCircleGatewayServer } from './presets.js';
export { normalizeServerResource as normalizeResource, normalizeAccessPolicy, normalizeUnlockPolicy, validateResourceMetadata, UNLOCK_MODES } from '../core/resource.js';

export const server = createNibgateServer();
export { NIBGATE_CONTENT_SETTING_FIELDS, createNibgateContentSettings, settingsToAccessPolicy, settingsToUnlockPolicy } from '../core/settings.js';
export { PAYMENT_RAILS, normalizePaymentRail } from '../core/payment.js';
export { createAdminApi, adminPageHtml } from './admin.js';
export { createFileStore, createMemoryStore, createPostgresStore } from './admin-store.js';
export { createWebhookManager, createWebhookApi } from './webhooks.js';
export { prepareOnchainRating, verifyRatingTx, submitOnchainRating } from './rating.js';
export { generateContentKey, encryptBytes, decryptBytes, packCipherBlob, unpackCipherBlob, wrapKey, unwrapKey, contentHashFor } from './crypto.js';
export { registerProvider, putBlob, getBlob, deleteBlob } from './storage.js';
