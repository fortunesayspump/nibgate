import { createPublicClient, http } from 'viem';
import {
  ARC_MAINNET, ARC_TESTNET, GatewayTransferError, createGatewayTransferStore,
  gatewayTransferKey, clearGatewayTransfer, runGatewayTransfer,
  ensureArcNetwork, checkArcConnection, repairArcNetwork, getWalletErrorMessage,
} from '@nibgate/wallet';

// Plain-browser adapter over the same audited state machine as the React UIs.
// Explicit network/provider choices must not depend on a CDN build's env vars.
export function createBrowserGatewayTransfer(options) {
  const network = options.network || ARC_TESTNET.caip2;
  const chain = network === ARC_MAINNET.caip2 ? ARC_MAINNET : network === ARC_TESTNET.caip2 ? ARC_TESTNET : null;
  if (!chain) throw new GatewayTransferError('Choose Arc mainnet or Arc testnet for Gateway.');
  const usdc = '0x3600000000000000000000000000000000000000';
  const gateway = options.gatewayAddress || (chain.id === 5042
    ? '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE'
    : '0x0077777d7EBA4688BDeF3E311b846F25870A19B9');
  const rpcUrl = options.rpcUrl || chain.rpcUrl;
  const client = createPublicClient({
    chain: { ...chain, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl),
  });
  const store = createGatewayTransferStore(() => window.sessionStorage);
  let busy = false;
  let destroyed = false;
  const keyFor = (address) => gatewayTransferKey({ chainId: chain.id, gateway, address });
  const isActive = () => !destroyed && options.isActive() !== false;
  const notify = (record, message) => { if (isActive()) options.onUpdate?.(record, message); };
  const saved = () => options.getAddress() ? store.read(keyFor(options.getAddress())) : null;

  function session() {
    const provider = options.getProvider();
    const address = options.getAddress();
    const assertActive = () => {
      if (!isActive() || options.getProvider() !== provider || options.getAddress()?.toLowerCase() !== address?.toLowerCase()) {
        throw new GatewayTransferError('The wallet or Gateway panel changed. Reconnect the displayed account to continue.');
      }
    };
    assertActive();
    if (!provider?.request) throw new GatewayTransferError('Connect an EVM wallet before continuing.');
    if (!/^0x[\da-f]{40}$/i.test(address || '')) throw new GatewayTransferError('Connect the displayed wallet before continuing.');
    return { provider, address, assertActive };
  }

  function report(error) {
    let record;
    try { record = saved(); } catch { /* keep existing visible recovery data */ }
    const message = record?.submitting
      ? 'The wallet request ended without a saved hash. Check wallet activity; do not submit another transaction.'
      : error instanceof GatewayTransferError ? error.message : getWalletErrorMessage(error) || 'Gateway could not be confirmed.';
    notify(record, `${message}${record?.status === 'pending' && (record.approvalHash || record.transferHash) ? ' Resume checks the saved transaction; do not send it again.' : ''}`);
  }

  async function run(kind, amount) {
    if (busy) return null;
    busy = true;
    try {
      const { provider, address, assertActive } = session();
      return await runGatewayTransfer({
        provider, address, kind, amount, chainId: chain.id, gateway, usdc, store,
        ensureNetwork: (p, guard) => ensureArcNetwork(p, { ...guard, chain }),
        checkConnection: (p, guard) => checkArcConnection(p, { ...guard, chain }),
        waitForReceipt: (hash) => client.waitForTransactionReceipt({ hash, timeout: 120000, checkReplacement: false }),
        getTransaction: (hash) => client.getTransaction({ hash }),
        assertActive,
        onUpdate: (record, message) => {
          if (options.getAddress()?.toLowerCase() === address.toLowerCase()) notify(record, message);
        },
      });
    } catch (error) { report(error); return null; }
    finally { busy = false; }
  }

  async function reset() {
    if (busy) return false;
    try {
      const record = saved();
      if (record && ['confirmed', 'reverted'].includes(record.status)) await run(record.kind, record.amount);
      if (busy) return false;
      const { address } = session();
      clearGatewayTransfer({ store, key: keyFor(address) });
      notify(null, '');
      return true;
    } catch (error) { report(error); return false; }
  }

  async function repair() {
    if (busy) return false;
    busy = true;
    try {
      const { provider, address, assertActive } = session();
      const accounts = await provider.request({ method: 'eth_accounts' });
      assertActive();
      if (accounts?.[0]?.toLowerCase() !== address.toLowerCase()) throw new GatewayTransferError('The wallet account does not match the displayed address.');
      notify(saved(), 'Repairing wallet connection…');
      await repairArcNetwork(provider, { chain, assertActive });
      assertActive();
      const current = await provider.request({ method: 'eth_accounts' });
      assertActive();
      if (current?.[0]?.toLowerCase() !== address.toLowerCase()) throw new GatewayTransferError('The wallet account changed during repair.');
      const record = saved();
      notify(record, record?.submitting
        ? 'Wallet RPC is responding. Check wallet activity for the interrupted request before any further payment.'
        : record?.status === 'pending'
          ? 'Wallet RPC is responding. Your saved transaction is unchanged; use Resume to continue checking it.'
          : 'Wallet RPC is responding. Continue when you are ready.');
      return true;
    } catch (error) { report(error); return false; }
    finally { busy = false; }
  }

  return { chain, gateway, run, reset, repair, saved, isBusy: () => busy, destroy: () => { destroyed = true; } };
}
