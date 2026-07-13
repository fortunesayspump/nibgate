import { normalizeResource } from '../core/resource.js';
import { browserWindow } from './env.js';
import { checkResourceAccess } from './access.js';

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
        ...options, ...extra, accessPath, createPaymentSignature: checkout, onStatus: status
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

  return { resource: normalized, unlock, mount };
}
