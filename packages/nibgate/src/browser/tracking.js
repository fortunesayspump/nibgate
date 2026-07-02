import { normalizePublisher, normalizeResource, validateResourceMetadata } from '../core/resource.js';
import { browserWindow } from './env.js';
import { emit, payloadWithResource } from './events.js';

export function createTrackingGate(resource) {
  const normalized = normalizeResource(resource);
  return {
    resource: normalized,
    content(extra = {}) {
      return emit('content_registered', payloadWithResource(normalized, extra));
    },
    view(extra = {}) {
      return emit('resource_view', payloadWithResource(normalized, extra));
    },
    track(eventName, payload = {}) {
      return emit(eventName, payloadWithResource(normalized, payload));
    }
  };
}

export function trackResourcePage(resource, options = {}) {
  const item = createTrackingGate(resource);
  const validation = validateResourceMetadata(item.resource, options.validation || {});
  if ((validation.warnings.length || validation.errors.length) && options.warn !== false && browserWindow()?.console?.warn) {
    browserWindow().console.warn('Nibgate content metadata needs attention', validation);
  }

  item.content({
    source: options.source,
    metadataQuality: { score: validation.score, warnings: validation.warnings, errors: validation.errors },
    ...(options.content || {})
  });
  item.view({
    source: options.source,
    path: options.path || browserWindow()?.location?.pathname || item.resource.path,
    referrer: options.referrer ?? browserWindow()?.document?.referrer ?? '',
    ...(options.view || {})
  });
  return item;
}

export { normalizePublisher, normalizeResource, validateResourceMetadata };
