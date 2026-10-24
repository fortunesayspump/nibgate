// Agent spending chain, resolved from the canonical registry — never
// hardcoded. dr-nib's own network selection (DRNIB_NETWORK, else inferred
// from the hub URL) picks the entry; the registry supplies chain id, RPC,
// and the USDC address.
import { NETWORKS } from '@nibgate/internal/networks.js';
import { fallback, http } from 'viem';
import { config } from '../env.js';

export function spendChain(name) {
  const net = NETWORKS[name || config.network] || NETWORKS.testnet;
  const rpcUrl = process.env.ARC_RPC_URL || net.rpcUrl;
  const configured = process.env.NIBGATE_RPC_MIRRORS || process.env.ARC_RPC_FALLBACK_URLS || process.env.DRNIB_RPC_BACKUP || '';
  const rpcUrls = [...new Set([
    rpcUrl,
    ...String(configured).split(',').map((url) => url.trim()).filter(Boolean),
    net.rpcUrl,
  ])];
  return {
    name: net.name,
    chainId: net.chainId,
    rpcUrl,
    rpcUrls,
    usdc: net.usdc,
    explorerUrl: net.explorerUrl,
    gatewayChain: net.isTestnet ? 'arcTestnet' : 'arc',
    facilitatorUrl: net.facilitatorUrl,
  };
}

export function spendRpcTransport(chain) {
  const urls = chain.rpcUrls?.length ? chain.rpcUrls : [chain.rpcUrl];
  return fallback(urls.map((url) => http(url, { retryCount: 1, timeout: 15_000 })), { rank: false });
}
