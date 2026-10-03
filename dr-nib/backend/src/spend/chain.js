// Agent spending chain, resolved from the canonical registry — never
// hardcoded. dr-nib's own network selection (DRNIB_NETWORK, else inferred
// from the hub URL) picks the entry; the registry supplies chain id, RPC,
// and the USDC address.
import { NETWORKS } from '@nibgate/internal/networks.js';
import { config } from '../env.js';

export function spendChain() {
  const net = NETWORKS[config.network] || NETWORKS.testnet;
  return {
    name: net.name,
    chainId: net.chainId,
    rpcUrl: process.env.ARC_RPC_URL || net.rpcUrl,
    usdc: net.usdc,
    explorerUrl: net.explorerUrl,
    gatewayChain: net.isTestnet ? 'arcTestnet' : 'arc',
  };
}
