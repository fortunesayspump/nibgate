import { ACCESS_MODES, CONTENT_TYPES, UNLOCK_MODES, normalizeAccessPolicy, normalizeContentType, normalizeResource, normalizeUnlockPolicy, validateResourceMetadata } from '../core/resource.js';
import { normalizeRating, ratingMessage } from '../core/rating.js';
import { browserWindow } from './env.js';
import { emit, flushQueue, payloadWithResource } from './events.js';
import { clearPaymentProof, getPaymentProof, hasUnlock, markUnlocked, storePaymentProof } from './storage.js';
import { stringifyJson } from './json.js';
import { rateContentOnchain } from './reputation.js';
import { createTransferCheckout, payWithTransfer } from './transfer.js';

export async function createCircleGatewayBrowserAdapter(options = {}) {
  const gateway = await import('./gateway.js');
  return gateway.createCircleGatewayBrowserAdapter(options);
}

export function createGate(resource, options = {}) {
  const normalized = normalizeResource(resource);
  const client = options.client || nibgate;

  return {
    resource: normalized,
    content(extra = {}) {
      return client.content(normalized, extra);
    },
    view(extra = {}) {
      return client.view(normalized, extra);
    },
    track(eventName, payload = {}) {
      return client.track(eventName, payloadWithResource(normalized, payload));
    },
    unlockStarted(extra = {}) {
      return client.unlockStarted(normalized, extra);
    },
    unlockCompleted(payment = {}) {
      markUnlocked(normalized, payment);
      return client.unlockCompleted(normalized, payment);
    },
    paymentCompleted(payment = {}) {
      return client.paymentCompleted(normalized, payment);
    },
    isUnlocked() {
      return hasUnlock(normalized);
    },
    markUnlocked(payment = {}) {
      markUnlocked(normalized, payment);
      client.unlockCompleted(normalized, payment);
      client.paymentCompleted(normalized, payment);
      return true;
    },
    async unlock(handlerOrPayment = {}) {
      client.unlockStarted(normalized);
      const payment = typeof handlerOrPayment === 'function'
        ? await handlerOrPayment(normalized)
        : handlerOrPayment;
      markUnlocked(normalized, payment || {});
      client.unlockCompleted(normalized, payment || {});
      client.paymentCompleted(normalized, payment || {});
      return { unlocked: true, resource: normalized, payment: payment || {} };
    },
    rate(rating = {}, extra = {}) {
      return client.rateResource(normalized, rating, extra);
    }
  };
}

export function rateResource(resource, rating = {}, extra = {}) {
  const normalized = normalizeResource(resource);
  const normalizedRating = normalizeRating(rating);
  const payload = {
    ...extra,
    ...normalizedRating,
    ratingMessage: extra.ratingMessage || rating.message || rating.ratingMessage || ratingMessage(normalized, normalizedRating, extra),
    ratingSignature: extra.ratingSignature || rating.signature || rating.ratingSignature || undefined,
    resource: normalized
  };
  return emit('content_rating', payload);
}

export { contentRatingHash, NIBGATE_CONTENT_HASH_NAMESPACE, NIBGATE_REPUTATION_ABI, NIBGATE_REPUTATION_CHAIN_ID, NIBGATE_REPUTATION_CHAIN_NAME, NIBGATE_REPUTATION_CONTRACT, NIBGATE_REPUTATION_RPC_URL, rateContentOnchain, reviewTextHash } from './reputation.js';

export function trackResourcePage(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const validation = validateResourceMetadata(item.resource, options.validation || {});
  if ((validation.warnings.length || validation.errors.length) && options.warn !== false && browserWindow()?.console?.warn) {
    browserWindow().console.warn('Nibgate content metadata needs attention', validation);
  }
  item.content({ source: options.source, metadataQuality: { score: validation.score, warnings: validation.warnings, errors: validation.errors }, ...(options.content || {}) });
  item.view({
    source: options.source,
    path: options.path || browserWindow()?.location?.pathname || item.resource.path,
    referrer: options.referrer ?? browserWindow()?.document?.referrer ?? '',
    ...(options.view || {})
  });
  return item;
}

export async function checkResourceAccess(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const accessPath = options.accessPath || item.resource.accessPath || '/api/nibgate/access';
  const status = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  status(options.checkingMessage || 'Checking access route...');
  item.unlockStarted({ source: options.source, paymentProvider: options.paymentProvider || 'nibgate-access-route' });

  const response = await fetch(accessPath, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      ...(getPaymentProof(item.resource) ? { 'x-nibgate-payment-proof': getPaymentProof(item.resource) } : {}),
      ...(options.headers || {})
    },
    body: options.body
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 402) {
    item.track('payment_challenge_returned', { source: options.source, challenge: payload, resource: item.resource });
    status(options.challengeMessage || 'Payment challenge returned. Continue with checkout.');
    if (typeof options.createPaymentSignature === 'function' || typeof options.checkout === 'function') {
      const paymentResult = await payWithPaymentSignature(resource, {
        ...options,
        challenge: payload,
        paymentRequiredHeader: response.headers.get('PAYMENT-REQUIRED') || response.headers.get('payment-required') || ''
      });
      return paymentResult;
    }
    if (options.autoPay && options.payPath) {
      const paymentResult = await payAndUnlockResource(resource, options);
      if (paymentResult.ok && options.retryAfterPay !== false) {
        return checkResourceAccess(resource, { ...options, autoPay: false });
      }
      return paymentResult;
    }
    return { ok: false, status: response.status, challenge: payload, resource: item.resource, response };
  }

  if (!response.ok) {
    status(payload.error || options.errorMessage || 'Access check failed');
    return { ok: false, status: response.status, error: payload.error || 'Access check failed', payload, resource: item.resource, response };
  }

  const payment = options.payment || payload.payment || null;
  if (payment) {
    item.unlockCompleted(payment);
    item.paymentCompleted(payment);
  }
  status(options.successMessage || 'Access allowed and Nibgate events emitted.');
  return { ok: true, status: response.status, payload, payment, resource: item.resource, response };
}

export async function payWithPaymentSignature(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const accessPath = options.accessPath || item.resource.accessPath || '/api/nibgate/access';
  const status = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  status(options.paymentMessage || 'Waiting for wallet payment approval...');
  item.unlockStarted({ source: options.source, paymentProvider: options.paymentProvider || 'wallet-gateway' });

  let paymentSignature = options.paymentSignature || '';
  let paymentMemo = options.memo || '';
  let paymentMetadata = options.payment || {};

  if (!paymentSignature) {
    const paymentRequiredHeader = options.paymentRequiredHeader || '';
    const challenge = options.challenge || null;
    const checkout = options.createPaymentSignature || options.checkout;
    const result = await checkout({
      resource: item.resource,
      challenge,
      paymentRequiredHeader,
      accessPath
    });
    paymentSignature = result?.paymentSignature || result?.signature || result?.payment || '';
    paymentMemo = result?.memo || result?.paymentMemo || '';
    paymentMetadata = result?.metadata || result?.paymentMetadata || result || {};
  }

  if (!paymentSignature) {
    const error = 'Wallet did not return a payment signature.';
    item.track('payment_failed', { source: options.source, error });
    status(error);
    return { ok: false, status: 400, error, resource: item.resource };
  }

  const response = await fetch(accessPath, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      'payment-signature': paymentSignature,
      ...(paymentMemo ? { 'payment-memo': paymentMemo } : {}),
      ...(options.headers || {})
    }
  });
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (_error) {
    payload = { error: responseText || 'Payment verification failed' };
  }

  if (!response.ok) {
    const detail = payload.detail || payload.reason || payload.invalidReason || payload.error || responseText || 'Payment verification failed';
    const error = typeof detail === 'string' ? detail : stringifyJson(detail);
    item.track('payment_failed', { source: options.source, status: response.status, error, ...paymentMetadata });
    status(options.paymentErrorMessage || error);
    return { ok: false, status: response.status, error, payload, resource: item.resource, response };
  }

  const payment = payload.payment || {
    paymentProvider: options.paymentProvider || 'wallet-gateway',
    paymentId: paymentSignature,
    memo: paymentMemo,
    amount: Number(item.resource.price || 0),
    revenue: Number(item.resource.price || 0),
    currency: item.resource.currency || 'USDC',
    ...paymentMetadata
  };
  storePaymentProof(item.resource, payload.unlockProof);
  item.markUnlocked(payment);
  status(options.paymentSuccessMessage || 'Payment verified. Content unlocked.');
  return { ok: true, status: response.status, payload, payment, resource: item.resource, response };
}

function setElementText(target, message) {
  const win = browserWindow();
  if (!target || !win) return;
  const element = typeof target === 'string' ? win.document.querySelector(target) : target;
  if (element) element.textContent = message || '';
}

function setElementDisabled(target, disabled) {
  const win = browserWindow();
  if (!target || !win) return;
  const element = typeof target === 'string' ? win.document.querySelector(target) : target;
  if (element && 'disabled' in element) element.disabled = Boolean(disabled);
}

export function createWalletCheckout(resource, options = {}) {
  const normalized = normalizeResource(resource);
  const accessPath = options.accessPath || normalized.accessPath || '/api/nibgate/access';
  const button = options.button || null;
  const statusTarget = options.status || null;
  const status = typeof options.onStatus === 'function'
    ? options.onStatus
    : (message) => setElementText(statusTarget, message);
  const checkout = options.checkout || options.createPaymentSignature || options.pay;

  if (typeof checkout !== 'function') {
    throw new Error('createWalletCheckout requires checkout/createPaymentSignature/pay callback for the active wallet or Gateway adapter.');
  }

  async function unlock(extra = {}) {
    setElementDisabled(button, true);
    try {
      return await checkResourceAccess(normalized, {
        ...options,
        ...extra,
        accessPath,
        createPaymentSignature: checkout,
        onStatus: status
      });
    } finally {
      setElementDisabled(button, false);
    }
  }

  function mount() {
    const win = browserWindow();
    if (!win || !button) return { unlock };
    const element = typeof button === 'string' ? win.document.querySelector(button) : button;
    if (element) element.addEventListener('click', () => unlock().catch((error) => status(error.message || 'Checkout failed.')));
    return { unlock };
  }

  return {
    resource: normalized,
    unlock,
    mount
  };
}

export function createEvmGatewayUnlock(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const win = browserWindow();
  const accessPath = options.accessPath || item.resource.accessPath || '/api/nibgate/access';
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
          await evm.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }]
          });
        } catch (_error) {
          // Not every injected wallet supports permission revocation. Clearing local
          // controller state still lets the visitor connect a different account in-wallet.
        }
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
    if (!walletAddress) await connect();
    const gatewayWallet = await createCircleGatewayBrowserAdapter({
      network,
      signer: {
        address: walletAddress,
        signTypedData: (typedData) => evm.request({
          method: 'eth_signTypedData_v4',
          params: [walletAddress, stringifyJson(typedData)]
        })
      },
      clientModule: options.circleClientModule,
      clientModuleUrl: options.circleClientModuleUrl
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
        accessPath,
        source,
        paymentProvider: options.paymentProvider || 'circle-gateway-browser',
        challengeMessage: options.challengeMessage || 'Gateway payment required. Connect your wallet to continue...',
        paymentMessage: options.paymentMessage || 'Approve the Gateway payment proof in your wallet...',
        successMessage: options.successMessage || `Unlocked ${item.resource.title || 'content'}.`,
        checkout,
        onStatus: setStatus
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
    } catch {}
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

export function createOnchainRating(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const win = browserWindow();
  const statusTarget = typeof options.status === 'string' ? win?.document.querySelector(options.status) : options.status;
  const ratingTarget = typeof options.ratingTarget === 'string' ? win?.document.querySelector(options.ratingTarget) : options.ratingTarget;
  const buttonSelector = options.ratingButtons || options.buttons || '[data-nibgate-rating-value], [data-rating]';
  const explicitButtons = Array.isArray(options.buttons)
    ? options.buttons
    : typeof options.buttons === 'string'
      ? Array.from(win?.document.querySelectorAll(options.buttons) || [])
      : options.buttons
        ? [options.buttons]
        : null;
  const buttons = explicitButtons || Array.from(win?.document.querySelectorAll(buttonSelector) || []);
  const source = options.source || 'nibgate-onchain-rating';

  let busy = false;
  let payment = options.payment || null;

  function setStatus(message) {
    if (typeof options.onStatus === 'function') options.onStatus(message);
    if (statusTarget) statusTarget.textContent = message || '';
  }

  function setBusy(value) {
    busy = Boolean(value);
    buttons.forEach((button) => {
      if (button && 'disabled' in button) button.disabled = busy;
    });
  }

  function setPayment(nextPayment = null) {
    payment = nextPayment || null;
    return payment;
  }

  function setVisible(isVisible) {
    if (!ratingTarget) return Boolean(isVisible);
    if ('hidden' in ratingTarget) ratingTarget.hidden = !isVisible;
    ratingTarget.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    return Boolean(isVisible);
  }

  function valueFromButton(button) {
    const raw = button?.dataset?.nibgateRatingValue || button?.dataset?.rating || button?.value || button?.textContent;
    const numeric = Number.parseFloat(String(raw || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(numeric) ? numeric : Number(options.rating || options.stars || 0);
  }

  async function rate(input = {}) {
    setBusy(true);
    try {
      const rating = Number.parseFloat(input.rating ?? input.stars ?? input.value ?? options.rating ?? options.stars);
      if (!Number.isFinite(rating)) throw new Error('Choose a rating before sending.');
      const paymentId = input.paymentId || options.paymentId || (typeof options.getPaymentId === 'function' ? options.getPaymentId() : payment?.paymentId);
      const unlockRef = input.unlockRef
        || options.unlockRef
        || (typeof options.getUnlockRef === 'function' ? options.getUnlockRef() : null)
        || paymentId
        || payment?.txHash
        || payment?.transactionHash
        || '';

      setStatus(options.pendingMessage || 'Send the onchain rating transaction...');
      const result = await rateContentOnchain(item.resource, {
        ...options,
        ...input,
        rating,
        paymentId,
        unlockRef,
        source
      });
      setStatus(options.successMessage || 'Rating sent to Nibgate reputation.');
      if (typeof options.onRated === 'function') options.onRated(result);
      return result;
    } catch (error) {
      const message = error?.message || options.errorMessage || 'Rating failed.';
      setStatus(message);
      if (typeof options.onError === 'function') options.onError(error);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function mount() {
    buttons.forEach((button) => {
      button?.addEventListener?.('click', () => rate({ rating: valueFromButton(button) }).catch(() => null));
    });
    if (options.visible !== undefined) setVisible(Boolean(options.visible));
    return controller;
  }

  const controller = { resource: item.resource, rate, mount, setPayment, setVisible };
  if (options.autoMount !== false) mount();
  return controller;
}

export function mountRatingUI(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const win = browserWindow();
  if (!win) return null;
  const target = typeof options.target === 'string' ? win.document.querySelector(options.target) : options.target;
  if (!target) return null;

  const stars = [1, 2, 3, 4, 5];
  let selectedRating = 0;

  const container = win.document.createElement('div');
  container.className = 'nibgate-rating-ui';
  container.style.cssText = 'display:flex;align-items:center;gap:4px;padding:8px 0';

  const starButtons = stars.map((value) => {
    const btn = win.document.createElement('button');
    btn.type = 'button';
    btn.dataset.nibgateRatingValue = String(value);
    btn.setAttribute('aria-label', `${value} star${value > 1 ? 's' : ''}`);
    btn.innerHTML = '☆';
    btn.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;color:#ccc;transition:color 0.15s;padding:2px;line-height:1';
    btn.addEventListener('mouseenter', () => {
      starButtons.forEach((b, i) => b.style.color = i < value ? '#f5b342' : '#ccc');
    });
    btn.addEventListener('mouseleave', () => {
      starButtons.forEach((b, i) => b.style.color = i < selectedRating ? '#f5b342' : '#ccc');
    });
    btn.addEventListener('click', () => {
      selectedRating = value;
      starButtons.forEach((b, i) => b.style.color = i < value ? '#f5b342' : '#ccc');
      rate(item.resource, { rating: value }).catch(() => {});
    });
    container.appendChild(btn);
    return btn;
  });

  const statusEl = win.document.createElement('span');
  statusEl.style.cssText = 'font-size:13px;color:#888;margin-left:8px';
  statusEl.textContent = options.label || 'Rate this content';
  container.appendChild(statusEl);

  target.appendChild(container);

  function rate(r, input = {}) {
    return item.rate({ ...input, rating: r });
  }

  function setRating(value) {
    selectedRating = value;
    starButtons.forEach((b, i) => b.style.color = i < value ? '#f5b342' : '#ccc');
  }

  return {
    resource: item.resource,
    container,
    setRating,
    rate
  };
}

export async function payAndUnlockResource(resource, options = {}) {
  const item = createGate(resource, options.gateOptions || {});
  const payPath = options.payPath || item.resource.payPath || '/api/nibgate/pay';
  const status = typeof options.onStatus === 'function' ? options.onStatus : () => {};

  status(options.paymentMessage || 'Starting payment...');
  item.unlockStarted({ source: options.source, paymentProvider: options.paymentProvider || 'circle-gateway' });

  const response = await fetch(payPath, {
    method: options.payMethod || 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.payHeaders || {})
    },
    body: JSON.stringify({
      resource: item.resource,
      ...(options.payPayload || {})
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.success) {
    item.track('payment_failed', { source: options.source, status: response.status, error: payload.error || 'Payment failed', detail: payload.detail || '' });
    status(payload.detail || payload.error || options.paymentErrorMessage || 'Payment failed.');
    return { ok: false, status: response.status, payload, resource: item.resource, response };
  }

  const payment = payload.payment || {
    paymentProvider: options.paymentProvider || 'circle-gateway',
    paymentId: payload.paymentId || `nibgate_payment_${Date.now()}`,
    amount: Number(item.resource.price || 0),
    revenue: Number(item.resource.price || 0),
    currency: item.resource.currency || 'USDC'
  };
  storePaymentProof(item.resource, payload.unlockProof);
  item.markUnlocked(payment);
  status(options.paymentSuccessMessage || 'Payment verified. Content unlocked.');
  return { ok: true, status: response.status, payload, payment, resource: item.resource, response };
}

export function setupResourcePage(resource, options = {}) {
  const item = trackResourcePage(resource, options);
  const win = browserWindow();
  if (!win) return item;

  const button = typeof options.button === 'string' ? win.document.querySelector(options.button) : options.button;
  const statusElement = typeof options.status === 'string' ? win.document.querySelector(options.status) : options.status;
  const setStatus = options.onStatus || ((message) => {
    if (statusElement) statusElement.textContent = message || '';
  });

  if (button) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await checkResourceAccess(resource, { ...options, onStatus: setStatus });
      } finally {
        button.disabled = false;
      }
    });
  }

  return item;
}

export function createNibgate(defaults = {}) {
  const defaultResource = defaults.resource ? normalizeResource(defaults.resource) : null;

  function resourceWithDefaults(resource = {}) {
    return normalizeResource({
      ...(defaultResource || {}),
      ...(typeof resource === 'string' ? { id: resource } : resource)
    });
  }

  return {
    content(resource, extra = {}) {
      return emit('content_registered', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    registerContent(resource, extra = {}) {
      return emit('content_registered', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    view(resource, extra = {}) {
      return emit('resource_view', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    track(eventName, payload = {}) {
      return emit(eventName || 'custom', payload);
    },
    unlockStarted(resource, extra = {}) {
      return emit('unlock_started', payloadWithResource(resourceWithDefaults(resource), extra));
    },
    unlockCompleted(resource, payment = {}) {
      return emit('unlock_completed', payloadWithResource(resourceWithDefaults(resource), payment));
    },
    paymentCompleted(resource, payment = {}) {
      return emit('payment_completed', payloadWithResource(resourceWithDefaults(resource), payment));
    },
    rateResource(resource, rating = {}, extra = {}) {
      return rateResource(resourceWithDefaults(resource), rating, extra);
    },
    ratingMessage(resource, rating = {}, messageOptions = {}) {
      return ratingMessage(resourceWithDefaults(resource), rating, messageOptions);
    },
    gate(resource, options = {}) {
      return createGate(resourceWithDefaults(resource), { ...options, client: this });
    },
    trackResourcePage(resource, options = {}) {
      return trackResourcePage(resourceWithDefaults(resource), options);
    },
    checkResourceAccess(resource, options = {}) {
      return checkResourceAccess(resourceWithDefaults(resource), options);
    },
    payWithPaymentSignature(resource, options = {}) {
      return payWithPaymentSignature(resourceWithDefaults(resource), options);
    },
    createWalletCheckout(resource, options = {}) {
      return createWalletCheckout(resourceWithDefaults(resource), options);
    },
    createCircleGatewayBrowserAdapter(options = {}) {
      return createCircleGatewayBrowserAdapter(options);
    },
    createTransferCheckout(resource, options = {}) {
      return createTransferCheckout(resourceWithDefaults(resource), options);
    },
    payWithTransfer(resource, options = {}) {
      return payWithTransfer(resourceWithDefaults(resource), options);
    },
    createEvmGatewayUnlock(resource, options = {}) {
      return createEvmGatewayUnlock(resourceWithDefaults(resource), options);
    },
    createOnchainRating(resource, options = {}) {
      return createOnchainRating(resourceWithDefaults(resource), options);
    },
    mountRatingUI(resource, options = {}) {
      return mountRatingUI(resourceWithDefaults(resource), options);
    },
    payAndUnlockResource(resource, options = {}) {
      return payAndUnlockResource(resourceWithDefaults(resource), options);
    },
    setupResourcePage(resource, options = {}) {
      return setupResourcePage(resourceWithDefaults(resource), options);
    },
    normalizeResource: resourceWithDefaults,
    normalizeContentType,
    flush: flushQueue
  };
}

export const nibgate = createNibgate();
export const gate = createGate;
export { createTransferCheckout, payWithTransfer } from './transfer.js';
export { CONTENT_TYPES, ACCESS_MODES, UNLOCK_MODES, normalizeContentType, normalizeResource, normalizeAccessPolicy, normalizeUnlockPolicy, validateResourceMetadata };
export { NIBGATE_CONTENT_SETTING_FIELDS, createNibgateContentSettings, settingsToAccessPolicy, settingsToUnlockPolicy } from '../core/settings.js';
export { PAYMENT_RAILS, normalizePaymentRail } from '../core/payment.js';
