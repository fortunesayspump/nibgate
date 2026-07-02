import { browserWindow } from './env.js';
import { normalizeResource } from '../core/resource.js';

export function unlockStorageKey(resource) {
  return `nibgate:unlock:${resource.id || resource.path || resource.url || 'content'}`;
}

export function proofStorageKey(resource) {
  return `nibgate:payment-proof:${resource.id || resource.path || resource.url || 'content'}`;
}

export function markUnlocked(resource, payment = {}) {
  const win = browserWindow();
  if (!win) return false;
  try {
    win.localStorage.setItem(unlockStorageKey(resource), JSON.stringify({
      unlockedAt: new Date().toISOString(),
      payment
    }));
    return true;
  } catch (_error) {
    return false;
  }
}

export function storePaymentProof(resource, proof) {
  const win = browserWindow();
  if (!win || !proof) return false;
  try {
    win.localStorage.setItem(proofStorageKey(resource), String(proof));
    return true;
  } catch (_error) {
    return false;
  }
}

export function getPaymentProof(resource) {
  const win = browserWindow();
  if (!win) return '';
  try {
    return win.localStorage.getItem(proofStorageKey(resource)) || '';
  } catch (_error) {
    return '';
  }
}

export function clearPaymentProof(resource) {
  const normalized = normalizeResource(resource);
  const win = browserWindow();
  if (!win) return false;
  try {
    win.localStorage.removeItem(proofStorageKey(normalized));
    win.localStorage.removeItem(unlockStorageKey(normalized));
    return true;
  } catch (_error) {
    return false;
  }
}

export function hasUnlock(resource) {
  const win = browserWindow();
  if (!win) return false;
  try {
    return Boolean(win.localStorage.getItem(unlockStorageKey(resource)));
  } catch (_error) {
    return false;
  }
}
