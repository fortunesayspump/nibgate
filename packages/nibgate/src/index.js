const CONTENT_TYPES = ['music', 'video', 'article', 'image'];
const TYPE_ALIASES = {
  audio: 'music',
  song: 'music',
  track: 'music',
  album: 'music',
  playlist: 'music',
  photo: 'image',
  picture: 'image',
  illustration: 'image',
  art: 'image',
  movie: 'video',
  clip: 'video'
};
const ACCESS_MODES = ['free', 'paid', 'blocked'];

function browserWindow() {
  return typeof window === 'undefined' ? null : window;
}

function normalizeContentType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (CONTENT_TYPES.includes(type)) return type;
  return TYPE_ALIASES[type] || 'article';
}

function normalizeAccessMode(value, fallback = 'paid') {
  const mode = String(value || '').trim().toLowerCase();
  return ACCESS_MODES.includes(mode) ? mode : fallback;
}

function normalizeAccessPolicy(value = {}) {
  if (typeof value === 'string') {
    const mode = normalizeAccessMode(value);
    return { humans: mode, agents: mode };
  }

  return {
    humans: normalizeAccessMode(value.humans || value.human || value.default, 'paid'),
    agents: normalizeAccessMode(value.agents || value.agent || value.default, 'paid')
  };
}

function normalizeResource(resource = {}) {
  const input = typeof resource === 'string' ? { id: resource } : (resource || {});
  return {
    ...input,
    id: String(input.id || input.contentId || input.slug || '').trim(),
    title: String(input.title || input.name || '').trim(),
    type: normalizeContentType(input.type || input.contentType),
    price: input.price ?? input.amount ?? '',
    path: input.path || input.route || undefined,
    url: input.url || undefined,
    imageUrl: input.imageUrl || input.image || undefined,
    tags: input.tags || undefined,
    access: normalizeAccessPolicy(input.access)
  };
}

function queueEvent(eventName, payload) {
  const win = browserWindow();
  if (!win) return false;
  win.__nibgateClientQueue = win.__nibgateClientQueue || [];
  win.__nibgateClientQueue.push({ eventName, payload });
  return true;
}

function flushQueue() {
  const win = browserWindow();
  if (!win?.nibgateHub?.track || !Array.isArray(win.__nibgateClientQueue)) return false;
  const queue = win.__nibgateClientQueue.splice(0);
  queue.forEach((entry) => {
    win.nibgateHub.track(entry.eventName, entry.payload);
  });
  return queue.length > 0;
}

function startQueueFlush() {
  const win = browserWindow();
  if (!win || win.__nibgateClientFlushStarted) return;
  win.__nibgateClientFlushStarted = true;
  let attempts = 0;
  const timer = win.setInterval(() => {
    attempts += 1;
    flushQueue();
    if (win.nibgateHub?.track || attempts >= 80) {
      win.clearInterval(timer);
      win.__nibgateClientFlushStarted = false;
    }
  }, 250);
}

function emit(eventName, payload = {}) {
  const win = browserWindow();
  if (!win) return false;

  if (win.nibgateHub?.track) {
    win.nibgateHub.track(eventName, payload);
    flushQueue();
    return true;
  }

  queueEvent(eventName, payload);
  startQueueFlush();
  return false;
}

function payloadWithResource(resource, extra = {}) {
  return {
    ...extra,
    resource: normalizeResource(resource)
  };
}

function unlockStorageKey(resource) {
  return `nibgate:unlock:${resource.id || resource.path || resource.url || 'content'}`;
}

function markUnlocked(resource, payment = {}) {
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

function hasUnlock(resource) {
  const win = browserWindow();
  if (!win) return false;
  try {
    return Boolean(win.localStorage.getItem(unlockStorageKey(resource)));
  } catch (_error) {
    return false;
  }
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
    }
  };
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
    gate(resource, options = {}) {
      return createGate(resourceWithDefaults(resource), { ...options, client: this });
    },
    normalizeResource: resourceWithDefaults,
    normalizeContentType,
    flush: flushQueue
  };
}

export const nibgate = createNibgate();
export const gate = createGate;
export { CONTENT_TYPES, ACCESS_MODES, normalizeContentType, normalizeResource, normalizeAccessPolicy };
