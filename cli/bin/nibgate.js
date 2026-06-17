#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../packages/core/config.js';
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
    return defaultConfig();
  }
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

  fs.writeFileSync(localConfigPath, `${JSON.stringify(defaultConfig(), null, 2)}\n`);
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
