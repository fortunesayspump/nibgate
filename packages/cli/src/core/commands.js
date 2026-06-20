import { loadConfig, writeConfig } from './config.js';
import { buildSiteManifest, connectSiteToHub, emitEventToHub, syncSiteWithHub, verifySiteWithHub } from './hub.js';
import { defaultConfig } from './default-config.js';
import { ensureConfigDoesNotExist, getGatewayBuyerOrExit, localConfigPath, requireHubConnection, amountArgOrExit } from './command-context.js';
import { printBalances } from './output.js';

export function initConfig() {
  ensureConfigDoesNotExist();
  writeConfig(localConfigPath, defaultConfig());
  console.log(`Created ${localConfigPath}`);
}

export function printRoutes() {
  const { config, configPath } = loadConfig();
  console.log(`Config: ${configPath}`);
  for (const route of config.routes) {
    const unit = route.unit ? `/${route.unit}` : '';
    console.log(`- ${route.id}: ${route.path} -> ${route.price} ${route.currency}${unit}`);
  }
}

export function printManifest() {
  const { config } = loadConfig();
  console.log(JSON.stringify(buildSiteManifest(config), null, 2));
}

export function printStatus() {
  const { config, configPath } = loadConfig();
  console.log(`Config: ${configPath}`);
  console.log(`Site: ${config.site.name}`);
  console.log(`Origin: ${config.site.origin}`);
  console.log(`Manifest: ${config.site.origin.replace(/\/$/, '')}/.well-known/nibgate.json`);
  console.log(`Verification: ${config.site.origin.replace(/\/$/, '')}/.well-known/nibgate-verify.txt`);
  console.log(`Hub API: ${config.hub.apiBaseUrl}`);
  console.log(`Hub site id: ${config.hub.siteId || '(not connected)'}`);
  if (config.hub.lastSyncAt) console.log(`Last sync: ${config.hub.lastSyncAt}`);
  if (config.hub.lastEventAt) console.log(`Last event: ${config.hub.lastEventAt}`);
}

export async function connectSite() {
  const loaded = loadConfig();
  const result = await connectSiteToHub(loaded.config);
  writeConfig(loaded.configPath, {
    ...loaded.config,
    hub: {
      ...loaded.config.hub,
      apiBaseUrl: loaded.config.hub.apiBaseUrl,
      siteId: result.siteId,
      siteToken: result.siteToken,
      verifyToken: result.verifyToken
    }
  });
  console.log(`Connected ${loaded.config.site.origin} to ${loaded.config.hub.apiBaseUrl}`);
  console.log(`Site ID: ${result.siteId}`);
  console.log('Verification token saved to nibgate.config.json');
}

export async function syncSite() {
  const loaded = requireHubConnection();
  const result = await syncSiteWithHub(loaded.config);
  writeConfig(loaded.configPath, {
    ...loaded.config,
    hub: {
      ...loaded.config.hub,
      lastSyncAt: result.lastSyncAt || new Date().toISOString()
    }
  });
  console.log(`Synced ${result.resourceCount} resources to the hub.`);
  console.log(`Verified: ${result.verified ? 'yes' : 'no'}`);
}

export async function verifySite() {
  const loaded = requireHubConnection();
  const result = await verifySiteWithHub(loaded.config);
  console.log(`Verification status: ${result.verified ? 'verified' : 'pending'}`);
  console.log(`Resources discovered: ${result.resourceCount}`);
}

export async function emitEvent(eventType, resourceId, value) {
  const loaded = requireHubConnection();

  if (!eventType || !resourceId) {
    console.error('Usage: nibgate event <resource_view|resource_unlock|payment_completed> <resourceId> [value]');
    process.exit(1);
  }

  const result = await emitEventToHub(loaded.config, {
    type: eventType,
    resourceId,
    value: value || undefined,
    currency: value ? 'USDC' : undefined,
    metadata: {
      source: 'cli'
    }
  });
  writeConfig(loaded.configPath, {
    ...loaded.config,
    hub: {
      ...loaded.config.hub,
      lastEventAt: result.lastEventAt || new Date().toISOString()
    }
  });
  console.log(`Event accepted for ${resourceId}.`);
}

export async function showBalance() {
  const buyer = await getGatewayBuyerOrExit();
  const [wallet, gateway] = await Promise.all([
    buyer.getUsdcBalance(),
    buyer.getGatewayBalance()
  ]);
  printBalances(buyer.address, wallet, gateway);
}

export async function depositToGateway(amount) {
  const buyer = await getGatewayBuyerOrExit();
  const result = await buyer.deposit(amountArgOrExit(amount));
  console.log(`Deposited ${result.formattedAmount} USDC into Gateway for ${result.depositor}`);
  if (result.approvalTxHash) {
    console.log(`Approval tx: ${result.approvalTxHash}`);
  }
  console.log(`Deposit tx: ${result.depositTxHash}`);
  const gateway = await buyer.getGatewayBalance();
  console.log(`Gateway available: ${gateway.formattedAvailable} USDC`);
}
