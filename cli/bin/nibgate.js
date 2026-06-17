#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, writeConfig, withConfigDefaults } from '../packages/core/config.js';
import { buildSiteManifest, connectSiteToHub, emitEventToHub, verifySiteWithHub, syncSiteWithHub } from '../packages/core/hub.js';
import { createPaymentProvider, createGatewayBuyer } from '../packages/core/payments.js';
import { startAppServer } from '../../app/server/start.js';

const command = process.argv[2] || 'help';
const cwd = process.cwd();
const localConfigPath = path.join(cwd, 'nibgate.config.json');

function printHelp() {
  console.log(`Nibgate

Usage:
  nibgate init       Create nibgate.config.json in this project
  nibgate dev        Run the Nibgate app and gateway locally
  nibgate routes     Print protected route config
  nibgate manifest   Print the public site manifest JSON
  nibgate status     Show local site and hub connection status
  nibgate connect    Register this site with the Nibgate hub
  nibgate sync       Send the current manifest to the Nibgate hub
  nibgate verify     Ask the hub to verify site ownership
  nibgate event      Emit a signed test event to the hub
  nibgate balance    Show buyer wallet and Gateway balances
  nibgate deposit    Deposit buyer USDC into Gateway balance

Environment:
  PORT                 Server port, defaults to 3000
  NIBGATE_CONFIG       Optional absolute path to a config file
  NIBGATE_PAYMENT_MODE demo or circle-gateway
  NIBGATE_SELLER_ADDRESS EVM seller wallet for Circle Gateway mode
  NIBGATE_BUYER_PRIVATE_KEY Demo buyer key for real browser unlocks
  NIBGATE_BUYER_CHAIN   Gateway buyer chain, defaults to arcTestnet
  NIBGATE_BUYER_RPC_URL Optional RPC URL for the buyer chain
`);
}

function defaultConfig() {
  return {
    site: {
      name: 'My Nibgate Site',
      origin: 'http://localhost:3000',
      creatorWallet: 'arc_testnet:replace_me',
      platformFeeBps: 600
    },
    payments: {
      mode: 'demo',
      sellerAddress: '',
      facilitatorUrl: 'https://gateway-api-testnet.circle.com',
      networks: ['eip155:5042002']
    },
    hub: {
      apiBaseUrl: process.env.NIBGATE_HUB_URL || 'http://localhost:3000',
      siteId: '',
      siteToken: '',
      verifyToken: '',
      publicSiteUrl: 'http://localhost:3000',
      lastSyncAt: '',
      lastEventAt: ''
    },
    routes: [
      {
        id: 'premium-article',
        path: '/premium/article',
        title: 'Premium Article',
        type: 'article',
        price: '0.005',
        agentPrice: '0.001',
        currency: 'USDC',
        network: 'arc-testnet',
        license: 'Paid read access with citation allowed after unlock.',
        splits: [
          {
            label: 'Creator',
            wallet: 'arc_testnet:replace_me',
            bps: 9400
          }
        ]
      }
    ]
  };
}

function getRuntimeConfig() {
  try {
    return loadConfig().config;
  } catch {
    return withConfigDefaults(defaultConfig());
  }
}

function requireHubConnection() {
  const loaded = loadConfig();
  if (!loaded.config.hub.siteId || !loaded.config.hub.siteToken) {
    console.error('This site is not connected to the Nibgate hub yet. Run `nibgate connect` first.');
    process.exit(1);
  }

  return loaded;
}

async function getGatewayBuyerOrExit() {
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

function amountArgOrExit() {
  const amount = process.argv[3];
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

function printBalances(address, wallet, gateway) {
  console.log(`Buyer: ${address}`);
  console.log(`Wallet USDC: ${wallet.formatted}`);
  console.log(`Gateway available: ${gateway.formattedAvailable}`);
  console.log(`Gateway total: ${gateway.formattedTotal}`);
  if (gateway.formattedWithdrawing !== '0') {
    console.log(`Gateway withdrawing: ${gateway.formattedWithdrawing}`);
  }
  if (gateway.formattedWithdrawable !== '0') {
    console.log(`Gateway withdrawable: ${gateway.formattedWithdrawable}`);
  }
}

if (command === 'init') {
  if (fs.existsSync(localConfigPath)) {
    console.error('nibgate.config.json already exists in this project.');
    process.exit(1);
  }

  writeConfig(localConfigPath, defaultConfig());
  console.log(`Created ${localConfigPath}`);
  process.exit(0);
}

if (command === 'dev') {
  startAppServer();
} else if (command === 'routes') {
  const { config, configPath } = loadConfig();
  console.log(`Config: ${configPath}`);
  for (const route of config.routes) {
    const unit = route.unit ? `/${route.unit}` : '';
    console.log(`- ${route.id}: ${route.path} -> ${route.price} ${route.currency}${unit}`);
  }
} else if (command === 'manifest') {
  const { config } = loadConfig();
  console.log(JSON.stringify(buildSiteManifest(config), null, 2));
} else if (command === 'status') {
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
} else if (command === 'connect') {
  const loaded = loadConfig();
  const result = await connectSiteToHub(loaded.config);
  const nextConfig = {
    ...loaded.config,
    hub: {
      ...loaded.config.hub,
      apiBaseUrl: loaded.config.hub.apiBaseUrl,
      siteId: result.siteId,
      siteToken: result.siteToken,
      verifyToken: result.verifyToken
    }
  };
  writeConfig(loaded.configPath, nextConfig);
  console.log(`Connected ${loaded.config.site.origin} to ${loaded.config.hub.apiBaseUrl}`);
  console.log(`Site ID: ${result.siteId}`);
  console.log(`Verification token saved to nibgate.config.json`);
} else if (command === 'sync') {
  const loaded = requireHubConnection();
  const result = await syncSiteWithHub(loaded.config);
  const nextConfig = {
    ...loaded.config,
    hub: {
      ...loaded.config.hub,
      lastSyncAt: result.lastSyncAt || new Date().toISOString()
    }
  };
  writeConfig(loaded.configPath, nextConfig);
  console.log(`Synced ${result.resourceCount} resources to the hub.`);
  console.log(`Verified: ${result.verified ? 'yes' : 'no'}`);
} else if (command === 'verify') {
  const loaded = requireHubConnection();
  const result = await verifySiteWithHub(loaded.config);
  console.log(`Verification status: ${result.verified ? 'verified' : 'pending'}`);
  console.log(`Resources discovered: ${result.resourceCount}`);
} else if (command === 'event') {
  const loaded = requireHubConnection();
  const eventType = process.argv[3];
  const resourceId = process.argv[4];
  const value = process.argv[5];

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
  const nextConfig = {
    ...loaded.config,
    hub: {
      ...loaded.config.hub,
      lastEventAt: result.lastEventAt || new Date().toISOString()
    }
  };
  writeConfig(loaded.configPath, nextConfig);
  console.log(`Event accepted for ${resourceId}.`);
} else if (command === 'balance') {
  const buyer = await getGatewayBuyerOrExit();
  const [wallet, gateway] = await Promise.all([
    buyer.getUsdcBalance(),
    buyer.getGatewayBalance()
  ]);
  printBalances(buyer.address, wallet, gateway);
} else if (command === 'deposit') {
  const amount = amountArgOrExit();
  const buyer = await getGatewayBuyerOrExit();
  const result = await buyer.deposit(amount);
  console.log(`Deposited ${result.formattedAmount} USDC into Gateway for ${result.depositor}`);
  if (result.approvalTxHash) {
    console.log(`Approval tx: ${result.approvalTxHash}`);
  }
  console.log(`Deposit tx: ${result.depositTxHash}`);
  const gateway = await buyer.getGatewayBalance();
  console.log(`Gateway available: ${gateway.formattedAvailable} USDC`);
} else {
  printHelp();
  process.exit(command === 'help' || command === '--help' || command === '-h' ? 0 : 1);
}
