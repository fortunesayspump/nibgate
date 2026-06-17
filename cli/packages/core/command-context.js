import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, withConfigDefaults } from './config.js';
import { defaultConfig } from './default-config.js';
import { createPaymentProvider, createGatewayBuyer } from './payments.js';

export const cwd = process.cwd();
export const localConfigPath = path.join(cwd, 'nibgate.config.json');

export function getRuntimeConfig() {
  try {
    return loadConfig().config;
  } catch {
    return withConfigDefaults(defaultConfig());
  }
}

export function requireHubConnection() {
  const loaded = loadConfig();
  if (!loaded.config.hub.siteId || !loaded.config.hub.siteToken) {
    console.error('This site is not connected to the Nibgate hub yet. Run `nibgate connect` first.');
    process.exit(1);
  }

  return loaded;
}

export async function getGatewayBuyerOrExit() {
  const provider = createPaymentProvider(getRuntimeConfig());
  if (!provider.isLive) {
    console.error('Set NIBGATE_PAYMENT_MODE=circle-gateway before using Gateway commands.');
    process.exit(1);
  }

  const buyer = await createGatewayBuyer(provider);
  if (!buyer) {
    console.error('Set NIBGATE_BUYER_PRIVATE_KEY before using Gateway commands.');
    process.exit(1);
  }

  return buyer;
}

export function amountArgOrExit(amount) {
  if (!amount) {
    console.error('Usage: nibgate deposit <amount>');
    process.exit(1);
  }

  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    console.error(`Invalid amount: ${amount}`);
    process.exit(1);
  }

  return amount;
}

export function ensureConfigDoesNotExist() {
  if (fs.existsSync(localConfigPath)) {
    console.error('nibgate.config.json already exists in this project.');
    process.exit(1);
  }
}
