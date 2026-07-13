import { validateResourceMetadata } from '../core/resource.js';
import { browserWindow } from './env.js';
import { createGate } from './gate.js';
import { checkResourceAccess } from './access.js';

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
