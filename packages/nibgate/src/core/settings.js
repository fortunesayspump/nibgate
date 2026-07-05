import { PAYMENT_RAILS, normalizePaymentRail } from './payment.js';
import { ACCESS_MODES, CONTENT_TYPES, UNLOCK_MODES, normalizeAccessPolicy, normalizeContentType, normalizeUnlockPolicy } from './resource.js';

export const NIBGATE_CONTENT_SETTING_FIELDS = [
  { name: 'publishToNibgate', label: 'Publish to Nibgate discovery', type: 'boolean', defaultValue: true },
  { name: 'type', label: 'Content type', type: 'select', options: CONTENT_TYPES, defaultValue: 'article' },
  { name: 'humanAccess', label: 'Human access', type: 'select', options: ACCESS_MODES, defaultValue: 'paid' },
  { name: 'agentAccess', label: 'Agent access', type: 'select', options: ACCESS_MODES, defaultValue: 'paid' },
  { name: 'unlockMode', label: 'Unlock mode', type: 'select', options: UNLOCK_MODES, defaultValue: 'one_time' },
  { name: 'paymentRail', label: 'Payment rail', type: 'select', options: PAYMENT_RAILS, defaultValue: 'gateway' },
  { name: 'price', label: 'Price', type: 'text', defaultValue: '0.005' },
  { name: 'currency', label: 'Currency', type: 'text', defaultValue: 'USDC' },
  { name: 'recipient', label: 'Recipient wallet', type: 'wallet', defaultValue: '' },
  { name: 'ratingsEnabled', label: 'Enable ratings', type: 'boolean', defaultValue: true },
  { name: 'license', label: 'License / terms', type: 'textarea', defaultValue: '' }
];

export function createNibgateContentSettings(input = {}) {
  const access = normalizeAccessPolicy(input.access || {
    humans: input.humanAccess,
    agents: input.agentAccess
  });
  const unlock = normalizeUnlockPolicy(input.unlock || input.unlockMode || 'one_time');

  return {
    publishToNibgate: input.publishToNibgate ?? input.publishedToNibgate ?? true,
    type: normalizeContentType(input.type || input.contentType || 'article'),
    humanAccess: access.humans,
    agentAccess: access.agents,
    unlockMode: unlock.mode,
    paymentRail: normalizePaymentRail(input.paymentRail || input.paymentMode || input.rail),
    price: String(input.price ?? input.amount ?? '0.005'),
    currency: input.currency || 'USDC',
    recipient: input.recipient || input.payTo || input.receiverAddress || input.creatorWallet || '',
    ratingsEnabled: input.ratingsEnabled ?? input.enableRatings ?? input.reputation?.ratingsEnabled ?? true,
    license: input.license || input.terms || ''
  };
}

export function settingsToAccessPolicy(settings = {}) {
  return normalizeAccessPolicy({
    humans: settings.humanAccess,
    agents: settings.agentAccess
  });
}

export function settingsToUnlockPolicy(settings = {}) {
  return normalizeUnlockPolicy(settings.unlockMode || settings.unlock || 'one_time');
}
