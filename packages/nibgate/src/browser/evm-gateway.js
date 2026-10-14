import { browserWindow } from './env.js';
import { clearPaymentProof, getPaymentProof, storePaymentProof } from './storage.js';
import { stringifyJson } from './json.js';
import { createGate } from './gate.js';
import { trackResourcePage } from './track.js';
import { ARC_MAINNET, ARC_TESTNET, ensureArcNetwork, checkArcConnection, repairArcNetwork, getWalletErrorMessage, isWalletRejection } from '@nibgate/wallet';

export async function createCircleGatewayBrowserAdapter(options = {}) {
  const gateway = await import('./gateway.js');
  return gateway.createCircleGatewayBrowserAdapter(options);
}

const HOSTED_PAY_URL = 'https://api.nibgate.xyz/hub/pay';
const HOSTED_TESTNET_PAY_URL = 'https://testnet-api.nibgate.xyz/hub/pay';
const addressKey = (address) => String(address || '').toLowerCase();

function resolveAccessPath(resource, options, chain) {
  if (options.accessPath && options.accessPath !== 'hosted') return options.accessPath;
  if (options.hosted || options.accessPath === 'hosted') return chain.testnet ? HOSTED_TESTNET_PAY_URL : HOSTED_PAY_URL;
  return resource.accessPath || '/api/nibgate/access';
}

export function createEvmGatewayUnlock(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const win = browserWindow();
  const source = options.source || 'nibgate-evm-gateway';
  const network = options.network ?? ARC_TESTNET.caip2;
  const chain = [ARC_TESTNET, ARC_MAINNET].find((candidate) => candidate.caip2 === network);
  if (!chain) throw new Error('Gateway unlock requires an explicit Arc Mainnet or Arc Testnet CAIP-2 network.');
  const accessPath = resolveAccessPath(item.resource, options, chain);
  const element = (value) => typeof value === 'string' ? win?.document.querySelector(value) : value;
  const statusTarget = element(options.status);
  const connectButton = element(options.connectButton);
  const disconnectButton = element(options.disconnectButton);
  const unlockButton = element(options.unlockButton);
  const clearButton = element(options.clearButton);
  const walletLabel = element(options.walletLabel);
  const unlockedTarget = element(options.unlockedTarget);
  const method = options.method || 'GET';
  // This is a Gateway authorization, separate from deposit/withdrawal state.
  // Keep unresolved proofs across remounts in this tab, including lost responses.
  const pendingKey = `nibgate:gateway-pending:${stringifyJson([accessPath, method, item.resource.id || item.resource.path || item.resource.url || 'content'])}`;
  let pending = null;
  let walletAddress = '';
  let currentProvider = null;
  let generation = 0;
  let connectionGeneration = 0;
  let operation = null;
  let mounted = false;
  let destroyed = false;
  let removeProviderListeners = () => {};

  function flowError(message) {
    const error = new Error(message);
    error.nibgateGateway = true;
    return error;
  }

  function setStatus(message) {
    if (destroyed) return;
    if (typeof options.onStatus === 'function') options.onStatus(message);
    if (statusTarget) statusTarget.textContent = message || '';
  }

  function invalidate() { generation += 1; }

  function getProvider() {
    if (destroyed) return null;
    const selected = typeof options.getProvider === 'function'
      ? options.getProvider()
      : Object.prototype.hasOwnProperty.call(options, 'provider') ? options.provider : win?.ethereum;
    const next = selected?.request ? selected : null;
    if (next !== currentProvider) {
      removeProviderListeners();
      currentProvider = next;
      connectionGeneration += 1;
      walletAddress = '';
      invalidate();
      const accountsChanged = (accounts) => {
        const address = Array.isArray(accounts) ? accounts[0] || '' : '';
        if (addressKey(address) !== addressKey(walletAddress)) invalidate();
        walletAddress = address;
        renderWallet();
      };
      const chainChanged = (id) => {
        // An intentional switch TO the selected chain is allowed. Any move
        // away invalidates the captured flow even if the user switches back.
        if (Number(id) !== chain.id) invalidate();
      };
      const disconnected = () => { connectionGeneration += 1; invalidate(); walletAddress = ''; renderWallet(); };
      next?.on?.('accountsChanged', accountsChanged);
      next?.on?.('chainChanged', chainChanged);
      next?.on?.('disconnect', disconnected);
      removeProviderListeners = () => {
        const remove = next?.removeListener || next?.off;
        if (remove) {
          remove.call(next, 'accountsChanged', accountsChanged);
          remove.call(next, 'chainChanged', chainChanged);
          remove.call(next, 'disconnect', disconnected);
        }
      };
    }
    return next;
  }

  function renderWallet() {
    if (destroyed) return;
    const hasProvider = Boolean(getProvider());
    const busy = Boolean(operation);
    if (walletLabel) walletLabel.textContent = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : hasProvider ? 'Ready to connect' : 'No wallet detected';
    if (connectButton) connectButton.textContent = walletAddress ? 'Connected' : 'Connect wallet';
    if (disconnectButton) disconnectButton.textContent = 'Disconnect';
    for (const button of [connectButton, disconnectButton, unlockButton, clearButton]) {
      if (button && 'disabled' in button) button.disabled = busy || (button === connectButton && !hasProvider) || (button === disconnectButton && !walletAddress);
    }
  }

  function setUnlocked(isUnlocked, payment = {}) {
    if (destroyed) return;
    if (unlockButton) unlockButton.textContent = isUnlocked ? 'Unlocked' : `Unlock for ${item.resource.price} ${item.resource.currency || 'USDC'}`;
    if (unlockedTarget) {
      if ('hidden' in unlockedTarget) unlockedTarget.hidden = !isUnlocked;
      unlockedTarget.setAttribute('aria-hidden', isUnlocked ? 'false' : 'true');
    }
    if (isUnlocked) item.markUnlocked(payment);
  }

  function readPending() {
    let saved;
    try { saved = win?.sessionStorage?.getItem(pendingKey); }
    catch { return pending; }
    if (saved !== null && saved !== undefined) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed || Array.isArray(parsed) || typeof parsed.id !== 'string' || !parsed.id || typeof parsed.network !== 'string' || !parsed.network || typeof parsed.address !== 'string' || !parsed.address || typeof parsed.submitted !== 'boolean' || (parsed.paymentSignature !== undefined && (typeof parsed.paymentSignature !== 'string' || !parsed.paymentSignature)) || (parsed.submitted && !parsed.paymentSignature)) throw new Error();
        pending = { ...parsed, ...(pending?.id === parsed.id && pending.provider ? { provider: pending.provider } : {}) };
      } catch { throw flowError('A previous Gateway payment has unreadable recovery data. Verify its status before paying again.'); }
    } else if (win?.sessionStorage) {
      pending = null;
    }
    return pending;
  }

  function savePending(value) {
    pending = value;
    try {
      if (!win?.sessionStorage) throw new Error('Session storage is unavailable.');
      win.sessionStorage.setItem(pendingKey, stringifyJson(value));
    }
    catch { throw flowError('Cannot save Gateway payment recovery data. Enable session storage before approving a payment.'); }
  }

  function finishPending(id) {
    if (pending?.id !== id) return;
    try {
      if (JSON.parse(win?.sessionStorage?.getItem(pendingKey) || 'null')?.id === id) win.sessionStorage.removeItem(pendingKey);
    } catch { return; }
    pending = null;
  }

  function assertActive(context) {
    if (destroyed || getProvider() !== context.provider || generation !== context.generation) {
      throw flowError('Wallet selection changed. Start again with the selected wallet.');
    }
    if (context.paymentId && readPending()?.id !== context.paymentId) throw flowError('Gateway payment recovery data changed. Start again.');
  }

  async function assertAccount(context) {
    assertActive(context);
    const accounts = await context.provider.request({ method: 'eth_accounts' });
    assertActive(context);
    if (!Array.isArray(accounts) || addressKey(accounts[0]) !== addressKey(context.address)) {
      invalidate();
      throw flowError('Wallet account changed. Start again with the selected account.');
    }
  }

  async function captureWallet(requestConnection = true) {
    const evm = getProvider();
    if (!evm) throw flowError(options.noWalletMessage || 'Install or open an EVM wallet to continue.');
    const before = generation;
    const connectionBefore = connectionGeneration;
    let accounts = await evm.request({ method: 'eth_accounts' });
    if (destroyed || getProvider() !== evm || generation !== before) throw flowError('Wallet selection changed. Please try again.');
    if (!accounts?.[0] && requestConnection) {
      setStatus('Opening wallet connection...');
      accounts = await evm.request({ method: 'eth_requestAccounts' });
      // Account events are expected while connecting, but the provider must
      // still be the one selected by the integrator.
      if (destroyed || getProvider() !== evm || connectionGeneration !== connectionBefore) throw flowError('Wallet selection changed. Please try again.');
      const activeAccounts = await evm.request({ method: 'eth_accounts' });
      if (destroyed || getProvider() !== evm || connectionGeneration !== connectionBefore || addressKey(activeAccounts?.[0]) !== addressKey(accounts?.[0])) throw flowError('Wallet account changed. Please try again.');
    }
    const address = accounts?.[0];
    if (!address) throw flowError('No wallet account selected.');
    walletAddress = address;
    renderWallet();
    return { provider: evm, address, generation };
  }

  function run(kind, action) {
    if (operation) {
      if (operation.kind === kind) return operation.promise;
      return Promise.reject(flowError('A wallet request is already in progress.'));
    }
    if (destroyed) return Promise.reject(flowError('This Gateway unlock controller has been destroyed.'));
    const task = { kind, promise: null };
    operation = task;
    task.promise = Promise.resolve().then(action).finally(() => {
      if (operation === task) operation = null;
      renderWallet();
    });
    renderWallet();
    return task.promise;
  }

  function connect() {
    return run('connect', async () => {
      const context = await captureWallet();
      setStatus('Wallet connected. You can unlock now.');
      return context.address;
    });
  }

  async function disconnect() {
    const evm = getProvider();
    const hadAddress = walletAddress;
    connectionGeneration += 1;
    invalidate();
    walletAddress = '';
    renderWallet();
    if (evm && hadAddress) {
      try { await evm.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); }
      catch { /* Local disconnect still invalidates the in-flight operation. */ }
    }
    setStatus(options.disconnectMessage || 'Wallet disconnected for this page.');
    return true;
  }

  async function requestAccess(context, proof = null) {
    await assertAccount(context);
    if (proof) {
      if (proof.network !== network || addressKey(proof.address) !== addressKey(context.address) || (proof.provider && proof.provider !== context.provider)) {
        throw flowError('Reconnect the original Gateway payment account and network to retry verification.');
      }
      if (readPending()?.id !== proof.id) throw flowError('Gateway payment recovery data changed. Verification stopped.');
      // Persist before the first submission. Any uncertain response keeps this
      // exact authorization; retryVerification never creates another proof.
      savePending({ ...proof, provider: undefined, submitted: true });
      pending.provider = context.provider;
    }
    assertActive(context);
    const response = await fetch(accessPath, {
      method,
      headers: {
        accept: 'application/json',
        ...(!proof && getPaymentProof(item.resource) ? { 'x-nibgate-payment-proof': getPaymentProof(item.resource) } : {}),
        ...(options.headers || {}),
        ...(proof ? { 'payment-signature': proof.paymentSignature } : {})
      },
      body: options.body
    });
    const responseText = await response.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    } catch {
      throw flowError('The access route returned an invalid response. Payment verification is not confirmed.');
    }
    assertActive(context);
    await assertAccount(context);
    if (!response.ok || payload.ok === false || (proof && payload.ok !== true)) {
      const detail = payload.detail || payload.reason || payload.invalidReason || payload.error || (proof ? 'Payment verification failed.' : 'Access check failed.');
      const error = typeof detail === 'string' ? detail : stringifyJson(detail);
      if (proof) item.track?.('payment_failed', { source, status: response.status, error, ...proof.metadata });
      else if (response.status === 402) item.track?.('payment_challenge_returned', { source, challenge: payload, resource: item.resource });
      return { ok: false, status: response.status, challenge: response.status === 402 ? payload : undefined, paymentRequiredHeader: response.headers.get('PAYMENT-REQUIRED') || '', error, payload, resource: item.resource, response };
    }
    const payment = payload.payment || (proof ? { ...proof.metadata, paymentId: proof.paymentSignature, paymentProvider: 'circle-gateway' } : null);
    storePaymentProof(item.resource, payload.unlockProof);
    if (proof) finishPending(proof.id);
    setUnlocked(true, payment || {});
    setStatus(options.successMessage || `Unlocked ${item.resource.title || 'content'}.`);
    const result = { ok: true, status: response.status, payload, payment, resource: item.resource, response };
    if (typeof options.onUnlock === 'function') options.onUnlock(result);
    return result;
  }

  async function assertSigningSelection(context) {
    await assertAccount(context);
    const currentChainId = await context.provider.request({ method: 'eth_chainId' });
    assertActive(context);
    if (Number(currentChainId) !== chain.id) throw flowError('Wallet network changed. No Gateway payment will be submitted.');
  }

  async function checkout(context, input) {
    await ensureArcNetwork(context.provider, { chain, assertActive: () => assertActive(context) });
    await assertAccount(context);
    const gatewayWallet = await createCircleGatewayBrowserAdapter({
      network,
      signer: {
        address: context.address,
        signTypedData: async (typedData) => {
          if (Number(typedData?.domain?.chainId) !== chain.id) throw flowError('Gateway payment proof uses the wrong network. No signature was requested.');
          const { createWalletClient, custom } = await import('viem');
          await checkArcConnection(context.provider, { chain, assertActive: () => assertActive(context) });
          await assertSigningSelection(context);
          const wc = createWalletClient({ transport: custom(context.provider) });
          const signature = await wc.signTypedData({ account: context.address, domain: typedData.domain, types: typedData.types, primaryType: typedData.primaryType, message: typedData.message });
          await assertSigningSelection(context);
          return signature;
        }
      },
      clientModule: options.circleClientModule
    });
    const result = await gatewayWallet.pay(input);
    await assertSigningSelection(context);
    return result;
  }

  function failure(error) {
    let message = isWalletRejection(error) ? 'Request cancelled.' : error?.nibgateGateway ? error.message : getWalletErrorMessage(error) || 'Unlock failed. Please try again.';
    if (pending?.submitted) message += ' A Gateway payment may already have been accepted. Retry verification of the saved proof; do not pay again.';
    setStatus(message);
    return { ok: false, status: 0, error: message, resource: item.resource };
  }

  function unlock() {
    return run('unlock', async () => {
      try {
        if (readPending()) throw flowError('A previous Gateway payment is unresolved. Use retryVerification() to check the saved proof before paying again.');
        const context = await captureWallet();
        setStatus('Requesting Gateway unlock...');
        item.unlockStarted({ source, paymentProvider: options.paymentProvider || 'circle-gateway-browser' });
        const access = await requestAccess(context);
        if (access.ok || access.status !== 402) {
          if (!access.ok) setStatus(access.error);
          return access;
        }
        setStatus(options.challengeMessage || 'Gateway payment required. Connect your wallet to continue...');
        // Preserve the creator's local self-unlock shortcut using only the
        // resource recipient, never an unrelated first challenge option.
        const recipient = item.resource.recipient || item.resource.payTo;
        if (recipient && addressKey(recipient) === addressKey(context.address)) {
          const payment = { paymentProvider: 'self', self: true, payer: context.address, amount: 0, revenue: 0, currency: item.resource.currency || 'USDC' };
          setUnlocked(true, payment);
          setStatus('This is your content. No payment needed.');
          const result = { ok: true, status: 200, self: true, payment, resource: item.resource };
          if (typeof options.onUnlock === 'function') options.onUnlock(result);
          return result;
        }
        setStatus(options.paymentMessage || 'Approve the Gateway payment proof in your wallet...');
        // Reserve before opening the signing prompt so another controller in
        // the same tab cannot start another payment for this resource.
        const id = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
        if (readPending()) throw flowError('Another Gateway payment is already in progress.');
        savePending({ id, network, address: context.address, submitted: false });
        context.paymentId = id;
        let result;
        try {
          result = await checkout(context, { resource: item.resource, challenge: access.challenge, paymentRequiredHeader: access.paymentRequiredHeader, accessPath });
          if (readPending()?.id !== id) throw flowError('Gateway payment state changed. Start again.');
          const paymentSignature = result?.paymentSignature || result?.signature;
          if (!paymentSignature) throw flowError('Wallet did not return a Gateway payment signature.');
          savePending({ id, network, address: context.address, paymentSignature, metadata: result.metadata || {}, submitted: false });
        } catch (error) {
          // The proof has never been submitted to the server, so a cancelled
          // signature can safely be retried only by another explicit action.
          finishPending(id);
          throw error;
        }
        pending.provider = context.provider;
        const verified = await requestAccess(context, pending);
        if (!verified.ok) setStatus(`${verified.error} Retry verification of the saved Gateway proof before paying again.`);
        return verified;
      } catch (error) { return failure(error); }
    }).catch(failure);
  }

  function repairConnection() {
    return run('repair', async () => {
      try {
        const context = await captureWallet(false);
        setStatus(`Requesting the official ${chain.name} connection settings...`);
        const result = await repairArcNetwork(context.provider, { chain, assertActive: () => assertActive(context) });
        await assertAccount(context);
        setStatus(`${chain.name} connection responds. Retry your intended action when ready.`);
        return result;
      } catch (error) {
        setStatus(error?.nibgateGateway ? error.message : getWalletErrorMessage(error) || 'Could not repair the wallet connection.');
        throw error;
      }
    });
  }

  function retryVerification() {
    return run('verify', async () => {
      try {
        const proof = readPending();
        if (!proof?.paymentSignature) throw flowError(proof ? 'A previous Gateway approval has no saved proof. Check the original payment before clearing this unfinished approval.' : 'There is no saved Gateway payment to verify.');
        if (proof.network !== network) throw flowError(`The saved Gateway payment uses ${proof.network}. Reopen that network to verify it.`);
        const context = await captureWallet(false);
        setStatus('Verifying the saved Gateway payment. No new payment signature will be requested...');
        const result = await requestAccess(context, proof);
        if (!result.ok) setStatus(`${result.error} The saved Gateway proof has been retained.`);
        return result;
      } catch (error) { return failure(error); }
    }).catch(failure);
  }

  function clear() {
    connectionGeneration += 1;
    invalidate();
    clearPaymentProof(item.resource);
    setUnlocked(false);
    // Never discard an authorization with an uncertain settlement outcome.
    const proof = readPending();
    if (proof && !proof.submitted && !proof.paymentSignature && !operation) finishPending(proof.id);
    setStatus(proof?.paymentSignature ? 'Local access cleared. The pending Gateway payment was kept; retry verification before paying again.' : 'Local payment proof cleared.');
  }

  async function hydrate() {
    if (destroyed || operation) return;
    const evm = getProvider();
    const before = generation;
    try {
      const accounts = evm ? await evm.request({ method: 'eth_accounts' }) : [];
      if (destroyed || getProvider() !== evm || generation !== before || operation) return;
      walletAddress = accounts?.[0] || '';
    } catch { /* Hydration must not prompt or change wallet selection. */ }
    renderWallet();
    setUnlocked(false);
  }

  const onConnect = () => connect().catch((error) => setStatus(error?.nibgateGateway ? error.message : getWalletErrorMessage(error) || 'Could not connect wallet.'));
  const onDisconnect = () => { disconnect().catch(failure); };
  const onUnlock = () => { unlock(); };
  function mount() {
    if (destroyed || mounted) return controller;
    mounted = true;
    connectButton?.addEventListener?.('click', onConnect);
    disconnectButton?.addEventListener?.('click', onDisconnect);
    unlockButton?.addEventListener?.('click', onUnlock);
    clearButton?.addEventListener?.('click', clear);
    hydrate();
    trackResourcePage(item.resource, { source });
    return controller;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    connectionGeneration += 1;
    invalidate();
    removeProviderListeners();
    connectButton?.removeEventListener?.('click', onConnect);
    disconnectButton?.removeEventListener?.('click', onDisconnect);
    unlockButton?.removeEventListener?.('click', onUnlock);
    clearButton?.removeEventListener?.('click', clear);
    currentProvider = null;
    walletAddress = '';
  }

  function getPendingPayment() {
    const proof = readPending();
    return proof ? { network: proof.network, address: proof.address, submitted: Boolean(proof.submitted), canRetry: Boolean(proof.paymentSignature) } : null;
  }

  const controller = { resource: item.resource, getPendingPayment, connect, disconnect, unlock, retryVerification, repairConnection, clear, hydrate, mount, destroy, getProvider, getWalletAddress: () => { getProvider(); return walletAddress; } };
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
