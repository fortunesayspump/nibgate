import { createNibgateServer } from './access.js';

export { actorFromRequest, accessModeFor } from './actor.js';
export { createPaymentChallenge } from './challenge.js';
export { createManifest, manifestResponse } from './manifest.js';
export { createUnlockToken, verifyUnlockToken } from './proof.js';
export { emitHubEvent } from './hub.js';
export { payWithGateway, createGatewayBuyer, getGatewayBalances, depositToGateway, withdrawFromGateway } from './gateway.js';
export { createNibgateServer, protect } from './access.js';
export { circleGatewayOptions, createCircleGatewayServer } from './presets.js';
export { normalizeServerResource as normalizeResource, normalizeAccessPolicy, normalizeUnlockPolicy, validateResourceMetadata, UNLOCK_MODES } from '../core/resource.js';

export const server = createNibgateServer();
export { NIBGATE_CONTENT_SETTING_FIELDS, createNibgateContentSettings, settingsToAccessPolicy, settingsToUnlockPolicy } from '../core/settings.js';
export { PAYMENT_RAILS, normalizePaymentRail } from '../core/payment.js';
