#!/usr/bin/env node
// Read-only Sourcify and bytecode inventory for Nibgate's fixed deployments.
import { readFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';

const root = new URL('../', import.meta.url);
const testnet = JSON.parse(await readFile(new URL('contracts/deployments/arc-testnet.json', root)));
const mainnet = JSON.parse(await readFile(new URL('contracts/deployments/arc-mainnet.json', root)));

const inventories = [
  {
    network: 'mainnet', chainId: 5042, rpcUrl: mainnet.rpcUrl,
    contracts: [
      ['NibgateReputationProxy', mainnet.reputation.proxyAddress, 'active'],
      ['NibgateReputationV2', mainnet.reputation.implementationAddress, 'active implementation'],
      ['GatewayFeeWalletFactory', mainnet.revenue.factoryAddress, 'active'],
      ['AgenticCommerce', mainnet.escrow.core, 'active'],
      ['NibgateRunSplitter', mainnet.escrow.splitter, 'active'],
      ['TipHoldingFactory', mainnet.tipHolding.factory, 'active V1'],
      ['NibgateSpenderV2', mainnet.spenderV2.address, mainnet.spenderV2.status],
      ['NibgateSpender', mainnet.legacySpender.address, mainnet.legacySpender.status],
    ],
  },
  {
    network: 'testnet', chainId: 5_042_002, rpcUrl: testnet.rpcUrl,
    contracts: [
      ['NibgateReputationProxy', testnet.proxyAddress, 'active'],
      ['NibgateReputationV2', testnet.v2.implementationAddress, 'active implementation'],
      ['GatewayFeeWalletFactory', testnet.revenue.factoryAddress, 'active'],
      ['Timelock', testnet.revenueV2Timelocked.timelockAddress, 'dry-run only'],
      ['GatewayFeeWalletFactoryTimelocked', testnet.revenueV2Timelocked.factoryAddress, 'dry-run only'],
      ['AgenticCommerce', testnet.escrow.core, 'active'],
      ['NibgateRunSplitter', testnet.escrow.splitter, 'active'],
      ['TipHoldingFactory', testnet.tipHolding.factory, 'active V1'],
    ],
  },
];

const rows = [];
for (const inventory of inventories) {
  const client = createPublicClient({ transport: http(inventory.rpcUrl, { timeout: 15_000, retryCount: 1 }) });
  for (const [name, address, status] of inventory.contracts) {
    const code = address ? await client.getBytecode({ address }).catch(() => null) : null;
    let sourcify = { verified: false, match: null, creationMatch: null, runtimeMatch: null };
    let sourcifyStatus = null;
    if (address) {
      const response = await fetch(`https://sourcify.dev/server/v2/contract/${inventory.chainId}/${address}`);
      sourcifyStatus = response.status;
      if (response.ok) {
        const body = await response.json();
        const result = body?.results?.[0] || body;
        sourcify = {
          verified: true,
          match: result.match || null,
          creationMatch: result.creationMatch || null,
          runtimeMatch: result.runtimeMatch || null,
        };
      }
    }
    rows.push({
      network: inventory.network, chainId: inventory.chainId, name, address, status,
      bytecodePresent: Boolean(code && code !== '0x'), bytecodeBytes: code && code !== '0x' ? (code.length - 2) / 2 : 0,
      sourcifyStatus, ...sourcify,
    });
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2));
