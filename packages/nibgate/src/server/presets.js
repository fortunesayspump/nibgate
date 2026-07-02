import { createNibgateServer } from './access.js';
import { serverEnv } from './env.js';

export function circleGatewayOptions(options = {}) {
  return {
    ...options,
    paymentMode: options.paymentMode || serverEnv('NIBGATE_PAYMENT_MODE') || 'circle-gateway',
    network: options.network || serverEnv('NIBGATE_PAYMENT_NETWORK') || 'eip155:5042002'
  };
}

export function createCircleGatewayServer(options = {}) {
  return createNibgateServer(circleGatewayOptions(options));
}
