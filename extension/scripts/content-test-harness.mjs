import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundled = await build({ entryPoints: ['src/content/tip-card.ts'], absWorkingDir: fileURLToPath(new URL('..', import.meta.url)), bundle: true, format: 'iife', write: false, target: 'es2022', loader: { '.svg': 'text' } });
const code = bundled.outputFiles[0].text;
export function fixture(body, head = '', url='https://creator.example/tutorial', jevProbability=0.95) {
  const dom = new JSDOM(`<!doctype html><html><head><title>A practical tutorial</title>${head}</head><body>${body}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() {
    const clone = this.cloneNode(true);
    clone.querySelectorAll('script,style,template,[hidden],[aria-hidden="true"]').forEach((el) => el.remove());
    return clone.textContent;
  } });
  let now = 0;
  let id = 0;
  const timers = new Map();
  window.setTimeout = (fn, delay = 0) => { const token = ++id; timers.set(token, { fn, at: now + delay }); return token; };
  window.clearTimeout = (token) => timers.delete(token);
  window.setInterval = (fn, delay) => { const token = ++id; timers.set(token, { fn, at: now + delay, repeat: delay }); return token; };
  window.clearInterval = window.clearTimeout;
  const messages = [];
  window.chrome = {
    storage: { local: { get: async () => ({}) } },
    runtime: {
      id: 'fixture-extension', getURL: (path) => `chrome-extension://fixture/${path}`,
      connect: () => ({ disconnect() {} }),
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === 'JEV_CLASSIFY') return { ok: true, probability: jevProbability };
        if (message.type === 'ASSESS') return { resolution: { state: 'held' } };
        if (message.type === 'TIP_OPEN') return { ok: true, id: 'test-tip' };
        if (message.type === 'TIP_RESULT') return { done: true, ok: false, error: 'Cancelled.' };
        return { ok: false };
      },
    },
  };
  const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
  const tick = async (ms) => {
    const end = now + ms;
    await flush();
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [token, value] = next;
      now = value.at;
      if (value.repeat) value.at += value.repeat; else timers.delete(token);
      value.fn();
      await flush();
    }
    now = end;
    await flush();
  };
  window.eval(code);
  return { window, messages, tick, host: () => window.document.querySelector('[data-nibgate-widget="floating"]'), reinject: () => window.eval(code), close: () => { window.__nibgateCardCleanup?.(); window.close(); } };
}
