import { config } from './env.js';
import { isEscrowConfigured } from './escrow/jobs.js';

export function researchAvailability({ network = config.network, production = !process.env.VITEST && (process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_ID)), escrowReady = isEscrowConfigured() } = {}) {
  const acceptingRuns = !production || escrowReady;
  return { network, acceptingRuns, escrowReady, reason: acceptingRuns ? null : network === 'mainnet' ? 'mainnet-funding-not-ready' : 'funding-unavailable' };
}
