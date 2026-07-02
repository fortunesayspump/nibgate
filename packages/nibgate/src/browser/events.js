import { browserWindow } from './env.js';
import { normalizeResource } from '../core/resource.js';

export function queueEvent(eventName, payload) {
  const win = browserWindow();
  if (!win) return false;
  win.__nibgateClientQueue = win.__nibgateClientQueue || [];
  win.__nibgateClientQueue.push({ eventName, payload });
  return true;
}

export function flushQueue() {
  const win = browserWindow();
  if (!win?.nibgateHub?.track || !Array.isArray(win.__nibgateClientQueue)) return false;
  const queue = win.__nibgateClientQueue.splice(0);
  queue.forEach((entry) => {
    win.nibgateHub.track(entry.eventName, entry.payload);
  });
  return queue.length > 0;
}

export function startQueueFlush() {
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

export function emit(eventName, payload = {}) {
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

export function payloadWithResource(resource, extra = {}) {
  return {
    ...extra,
    resource: normalizeResource(resource)
  };
}
