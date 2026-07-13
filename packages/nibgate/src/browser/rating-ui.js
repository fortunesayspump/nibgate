import { normalizeResource, normalizeContentType } from '../core/resource.js';
import { normalizeRating, ratingMessage } from '../core/rating.js';
import { emit } from './events.js';
import { browserWindow } from './env.js';
import { rateContentOnchain } from './reputation.js';
import { createGate } from './gate.js';

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
      const unlockRef = input.unlockRef || options.unlockRef
        || (typeof options.getUnlockRef === 'function' ? options.getUnlockRef() : null)
        || paymentId || payment?.txHash || payment?.transactionHash || '';

      setStatus(options.pendingMessage || 'Send the onchain rating transaction...');
      const result = await rateContentOnchain(item.resource, { ...options, ...input, rating, paymentId, unlockRef, source });
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
      rateResource(item.resource, { rating: value }).catch(() => {});
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

  return { resource: item.resource, container, setRating, rate };
}
