import { normalizeResource } from '../core/resource.js';
import { browserWindow } from './env.js';
import { clearPaymentProof } from './storage.js';
import { stringifyJson } from './json.js';
import { createGate } from './gate.js';
import { checkResourceAccess } from './access.js';
import { trackResourcePage } from './track.js';
import { switchToArcNetwork } from './reputation.js';

export async function createCircleGatewayBrowserAdapter(options = {}) {
  const gateway = await import('./gateway.js');
  return gateway.createCircleGatewayBrowserAdapter(options);
}

const HOSTED_PAY_URL = 'https://api.nibgate.xyz/api/hub/pay';

function resolveAccessPath(resource, options) {
  if (options.hosted || options.accessPath === 'hosted') return HOSTED_PAY_URL;
  return options.accessPath || resource.accessPath || '/api/nibgate/access';
}

export function createEvmGatewayUnlock(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const win = browserWindow();
  const accessPath = resolveAccessPath(item.resource, options);
  const source = options.source || 'nibgate-evm-gateway';
  const network = options.network || 'eip155:5042002';
  const statusTarget = typeof options.status === 'string' ? win?.document.querySelector(options.status) : options.status;
  const connectButton = typeof options.connectButton === 'string' ? win?.document.querySelector(options.connectButton) : options.connectButton;
  const disconnectButton = typeof options.disconnectButton === 'string' ? win?.document.querySelector(options.disconnectButton) : options.disconnectButton;
  const unlockButton = typeof options.unlockButton === 'string' ? win?.document.querySelector(options.unlockButton) : options.unlockButton;
  const clearButton = typeof options.clearButton === 'string' ? win?.document.querySelector(options.clearButton) : options.clearButton;
  const walletLabel = typeof options.walletLabel === 'string' ? win?.document.querySelector(options.walletLabel) : options.walletLabel;
  const unlockedTarget = typeof options.unlockedTarget === 'string' ? win?.document.querySelector(options.unlockedTarget) : options.unlockedTarget;

  let walletAddress = '';
  let busy = false;

  function setStatus(message) {
    if (typeof options.onStatus === 'function') options.onStatus(message);
    if (statusTarget) statusTarget.textContent = message || '';
  }

  function shortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  }

  function provider() {
    return win?.ethereum || options.provider || null;
  }

  function setBusy(value) {
    busy = Boolean(value);
    [connectButton, disconnectButton, unlockButton, clearButton].forEach((button) => {
      if (button && 'disabled' in button) {
        button.disabled = busy || (button === connectButton && !provider()) || (button === disconnectButton && !walletAddress);
      }
    });
  }

  function renderWallet() {
    const hasProvider = Boolean(provider());
    if (walletLabel) walletLabel.textContent = walletAddress ? shortAddress(walletAddress) : hasProvider ? 'Ready to connect' : 'No wallet detected';
    if (connectButton) connectButton.textContent = walletAddress ? 'Connected' : 'Connect wallet';
    if (disconnectButton) disconnectButton.textContent = 'Disconnect';
    if (connectButton && 'disabled' in connectButton) connectButton.disabled = busy || !hasProvider;
    if (disconnectButton && 'disabled' in disconnectButton) disconnectButton.disabled = busy || !walletAddress;
  }

  function setUnlocked(isUnlocked, payment = {}) {
    if (unlockButton) unlockButton.textContent = isUnlocked ? 'Unlocked' : `Unlock for ${item.resource.price} ${item.resource.currency || 'USDC'}`;
    if (unlockedTarget) {
      if ('hidden' in unlockedTarget) unlockedTarget.hidden = !isUnlocked;
      unlockedTarget.setAttribute('aria-hidden', isUnlocked ? 'false' : 'true');
    }
    if (isUnlocked) item.markUnlocked(payment);
  }

  async function connect() {
    setBusy(true);
    setStatus('Opening wallet connection...');
    try {
      const evm = provider();
      if (!evm) throw new Error(options.noWalletMessage || 'Install or open an EVM wallet to continue.');
      const accounts = await evm.request({ method: 'eth_requestAccounts' });
      walletAddress = Array.isArray(accounts) ? accounts[0] || '' : '';
      if (!walletAddress) throw new Error('No wallet account selected.');
      renderWallet();
      setStatus('Wallet connected. You can unlock now.');
      return walletAddress;
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const evm = provider();
      if (evm?.request && walletAddress) {
        try {
          await evm.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
        } catch (_error) { }
      }
      walletAddress = '';
      renderWallet();
      setStatus(options.disconnectMessage || 'Wallet disconnected for this page.');
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function checkout(input) {
    const evm = provider();
    if (!evm) throw new Error(options.noWalletMessage || 'Install or open an EVM wallet to continue.');
    // Always fetch the current wallet from MetaMask — the cached walletAddress
    // might be stale if the user switched accounts after connecting.
    const currentAccounts = await evm.request({ method: 'eth_accounts' }).catch(() => []);
    let currentAddress = Array.isArray(currentAccounts) && currentAccounts[0] ? currentAccounts[0] : '';
    if (!currentAddress) currentAddress = await connect();
    if (!currentAddress) throw new Error('No wallet account selected.');
    if (currentAddress !== walletAddress) walletAddress = currentAddress;
    // Make sure the wallet is on Arc Testnet before signing the Gateway payment
    // proof — otherwise the sign prompt happens on Ethereum (the wallet's default).
    await switchToArcNetwork(evm);
    const gatewayWallet = await createCircleGatewayBrowserAdapter({
      network,
      signer: {
        address: currentAddress,
        signTypedData: async (typedData) => {
          const { createWalletClient, custom } = await import('viem');
          const wc = createWalletClient({ transport: custom(evm) });
          // Use viem's signTypedData — handles EIP-712 encoding correctly
          // across all wallets (MetaMask, Rabby, etc.)
          return wc.signTypedData({
            account: currentAddress,
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message
          });
        }
      },
      clientModule: options.circleClientModule
    });
    return gatewayWallet.pay(input);
  }

  async function unlock() {
    setBusy(true);
    try {
      if (!walletAddress) await connect();
      setBusy(true);
      setStatus('Requesting Gateway unlock...');
      const result = await checkResourceAccess(item.resource, {
        accessPath, source,
        paymentProvider: options.paymentProvider || 'circle-gateway-browser',
        challengeMessage: options.challengeMessage || 'Gateway payment required. Connect your wallet to continue...',
        paymentMessage: options.paymentMessage || 'Approve the Gateway payment proof in your wallet...',
        successMessage: options.successMessage || `Unlocked ${item.resource.title || 'content'}.`,
        method: options.method,
        headers: options.headers,
        body: options.body,
        checkout, onStatus: setStatus
      });
      if (result.ok) {
        setUnlocked(true, result.payment || {});
        if (typeof options.onUnlock === 'function') options.onUnlock(result);
      }
      return result;
    } catch (error) {
      const message = error?.message || 'Unlock failed. Please try again.';
      setStatus(message);
      return { ok: false, status: 0, error: message, resource: item.resource };
    } finally {
      setBusy(false);
      renderWallet();
    }
  }

  function clear() {
    clearPaymentProof(item.resource);
    setUnlocked(false);
    setStatus('Local payment proof cleared. The next unlock will require Gateway payment again.');
  }

  async function hydrate() {
    const evm = provider();
    try {
      const accounts = evm ? await evm.request({ method: 'eth_accounts' }) : [];
      walletAddress = Array.isArray(accounts) ? accounts[0] || '' : '';
    } catch { }
    renderWallet();
    setUnlocked(false);
  }

  function mount() {
    connectButton?.addEventListener?.('click', () => connect().catch((error) => setStatus(error?.message || 'Could not connect wallet.')));
    disconnectButton?.addEventListener?.('click', () => disconnect().catch((error) => setStatus(error?.message || 'Could not disconnect wallet.')));
    unlockButton?.addEventListener?.('click', () => unlock());
    clearButton?.addEventListener?.('click', clear);
    hydrate();
    trackResourcePage(item.resource, { source });
    return controller;
  }

  const controller = { resource: item.resource, connect, disconnect, unlock, clear, hydrate, mount, getWalletAddress: () => walletAddress };
  if (options.autoMount !== false) mount();
  return controller;
}

export function createHostedUnlock(resource, options = {}) {
  return createEvmGatewayUnlock(resource, {
    ...options,
    hosted: true,
    noWalletMessage: options.noWalletMessage || 'Install MetaMask or another EVM wallet to unlock premium content.',
  });
}
