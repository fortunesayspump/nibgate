// Content script: runs on every http(s) page (minus Nibgate hosts).
// Detects creator content and shows a dismissible floating tip control.
// Rendered in a Shadow DOM so the host page's CSS can never break it (and
// ours never leaks out). No wallet code here: signing happens in the worker.
import { extractContent, contentContainer, isBoilerplateZone, recipientWalletFromPage, recipientWalletsFromPage, hasNibgateSdk } from './extract';
import type { PageWalletCandidate } from './extract';
import { mapPage } from './page-model';
import { isTippableUrl } from './guard';
import coffeeSvg from '../../icons/coffee.svg';

// Shared UXWing coffee icon for the floating control and inline reminder.
const COFFEE_ICON = coffeeSvg.replace('<svg ', '<svg width="26" height="26" fill="currentColor" aria-hidden="true" ');

const CARD_ID = 'nibgate-card';
const HOST_ATTR = 'data-nibgate-widget';

// Module ref into the shadow tree (document.getElementById can't see into it).
let statusEls: HTMLElement[] = [];
let tipBusy = false;

type CardInput = {
  content: { url: string; canonicalUrl: string; title: string; author: string; siteName: string; excerptTail?: string };
  pageWallet: string;
  hasSdk: boolean;
  isMainnet: boolean;
  state: 'resolved' | 'held' | 'unknown';
  end?: Element | null;
  root?: Element | null;
};

function fontUrl(file: string): string {
  try {
    return chrome.runtime.getURL(`fonts/${file}`);
  } catch {
    return '';
  }
}

type PageVisual = {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  font: string;
  size: string;
};

function parseCssColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const parts = String(value || '')
    .replace(/[^\d.,/ ]/g, ' ')
    .trim()
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((part) => Number(part));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const linear = (channel: number): number => {
    const c = Math.min(255, Math.max(0, channel)) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function withAlpha(color: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

function sanitizeFontStack(stack: string): string {
  const families = String(stack || '')
    .split(',')
    .map((family) => family.trim().replace(/[^A-Za-z0-9 .'_"+-]/g, '').slice(0, 80))
    .filter((family) => family.length > 1);
  return families.join(', ');
}

function opaqueBackground(start: Element | null): string {
  let node: Element | null = start;
  while (node) {
    const background = window.getComputedStyle(node).backgroundColor;
    const parsed = parseCssColor(background);
    if (parsed && parsed.a > 0.9) return background;
    node = node.parentElement;
  }
  return 'rgb(255, 255, 255)';
}

function pageVisual(container: Element): PageVisual {
  const fallback = {
    background: 'rgb(255, 255, 255)',
    foreground: 'rgb(10, 10, 10)',
  };
  const themeAttribute = String(document.documentElement.dataset.theme || '').toLowerCase();
  const background = opaqueBackground(container);
  const bodyStyle = window.getComputedStyle(document.body);
  const foreground = parseCssColor(bodyStyle.color) ? bodyStyle.color : fallback.foreground;
  const luminance = relativeLuminance(parseCssColor(background) || { r: 255, g: 255, b: 255, a: 1 });
  const darkByLuminance = luminance < 0.39;
  const pageIsDark = themeAttribute === 'dark' || (themeAttribute !== 'light' && darkByLuminance);
  const pageFont = sanitizeFontStack(bodyStyle.fontFamily);
  const parsedSize = Number.parseFloat(bodyStyle.fontSize || '');
  const bodySize = Number.isFinite(parsedSize) ? Math.min(17, Math.max(12.5, parsedSize)) : 14;
  const foregroundColor = parseCssColor(foreground) || parseCssColor(fallback.foreground)!;
  const light = !pageIsDark;
  return {
    background: light ? background : `rgba(${foregroundColor.r},${foregroundColor.g},${foregroundColor.b},0.03)`,
    foreground: light ? foreground : withAlpha(foregroundColor, 0.95),
    muted: withAlpha(foregroundColor, 0.72),
    border: withAlpha(foregroundColor, 0.22),
    font: pageFont ? `${pageFont}, 'Kumbh Sans','ABC Favorit',system-ui,sans-serif` : `'Kumbh Sans','ABC Favorit',system-ui,sans-serif`,
    size: `${bodySize}px`,
  };
}

function applyPageVisual(host: HTMLElement, container: Element): void {
  const visual = pageVisual(container);
  host.style.setProperty('--wc-bg', visual.background);
  host.style.setProperty('--wc-fg', visual.foreground);
  host.style.setProperty('--wc-muted', visual.muted);
  host.style.setProperty('--wc-border', visual.border);
  host.style.setProperty('--wc-font', visual.font);
  host.style.setProperty('--wc-size', visual.size);
}

let themeObserver: MutationObserver | null = null;

function watchPageVisual(host: HTMLElement, container: Element): void {
  try {
    themeObserver?.disconnect();
    themeObserver = new MutationObserver(() => {
      try {
        document.querySelectorAll<HTMLElement>(`[${HOST_ATTR}]`).forEach((widget) => applyPageVisual(widget, container));
      } catch {}
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    themeObserver.observe(container, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  } catch {}
}

function shadowStyles(floating = true): string {
  const kumbh = fontUrl('KumbhSans-Regular.woff2');
  const kumbh600 = fontUrl('KumbhSans-SemiBold.woff2');
  const kumbh700 = fontUrl('KumbhSans-Bold.woff2');
  return `
    @font-face { font-family:'Kumbh Sans'; src:url('${kumbh}') format('woff2'); font-weight:400; }
    @font-face { font-family:'Kumbh Sans'; src:url('${kumbh600}') format('woff2'); font-weight:600; }
    @font-face { font-family:'Kumbh Sans'; src:url('${kumbh700}') format('woff2'); font-weight:700; }
    :host { all: initial; ${floating ? 'position:fixed !important; inset:auto max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) auto !important; z-index:2147483646 !important; width:max-content; max-width:calc(100vw - 32px);' : 'width:100%; margin:24px 0;'} display:block; --bg:#f4f4f0; --surface:#ffffff; --surface-2:#f0eee6; --border:#11111124; --fg:#0a0a0a; --muted:#44423d; --accent:#7c9a6d; --accent-ink:#10110e; --gold:#ffc900; --danger:#ff3e30; }
    @media (prefers-color-scheme: dark) {
      :host { --bg:#171813; --surface:#20221c; --surface-2:#242820; --border:#f3efe729; --fg:#f4f4f0; --muted:#b9b2a6; --accent:#a9c69a; --danger:#ff5b4d; }
    }
    /* Slim coffee trigger: the only thing that renders in-page. Everything
       about money lives in the extension window. */
    #nibgate-card { position:relative; display:flex; flex-direction:column; align-items:${floating ? 'flex-end' : 'flex-start'}; }
    .dismiss { position:absolute; top:-5px; right:-5px; display:grid; place-items:center; width:20px; height:20px; padding:0; border:1px solid var(--border); border-radius:50%; background:var(--surface); color:var(--fg); cursor:pointer; box-shadow:0 2px 6px #0002; }
    .dismiss::after { content:''; position:absolute; inset:-4px; border-radius:50%; }
    button:focus-visible { outline:3px solid var(--fg); outline-offset:3px; }
    .tipbtn { display:inline-flex; align-items:center; justify-content:center; gap:8px; box-sizing:border-box; cursor:pointer; margin:0; ${floating ? 'width:48px; height:48px; box-shadow:0 4px 20px #0003;' : 'width:max-content; max-width:100%;'}
      font-family:var(--wc-font, 'Kumbh Sans','ABC Favorit',system-ui,sans-serif); font-size:var(--wc-size, 14px); font-weight:700;
      background:var(--accent); color:var(--accent-ink); border:0; border-radius:${floating ? '50%' : '999px'}; padding:${floating ? '0' : '10px 18px'}; }
    .tipbtn:hover { filter:brightness(1.05); }
    .tipbtn svg { flex:none; display:block; }
    .tipbtn:disabled { opacity:.6; cursor:default; filter:none; }
    [data-tip-status]:empty { display:none; }
    [data-tip-status] { font-size:.86em; margin:8px 0 0; max-width:240px; background:var(--surface); color:var(--fg); border-radius:8px; padding:8px;
      font-family:var(--wc-font, 'Kumbh Sans','ABC Favorit',system-ui,sans-serif); }
  `;
}

function cardMarkup(floating = true): string {
  return `
    <style>${shadowStyles(floating)}</style>
    <div id="${CARD_ID}">
      ${floating ? '<button class="dismiss" data-dismiss-tip aria-label="Dismiss floating tip button" title="Dismiss for this page"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>' : ''}
      <button class="tipbtn" data-open-tip aria-label="Tip the creator" title="Tip the creator">${COFFEE_ICON}${floating ? '' : 'Tip the creator'}</button>
      <div data-tip-status role="status" aria-live="polite"></div>
    </div>`;
}

async function assessState(): Promise<CardInput | null> {
  // Never tip platforms/apps/share/auth pages, whatever they render.
  if (!isTippableUrl(window.location.href)) {
    try {
      document.documentElement.setAttribute('data-nibgate-kind', 'platform');
    } catch {}
    return null;
  }
  // Deterministic JEV page model decides whether this is a content page and
  // maps the real content root/end. Feeds, listing pages, and landing pages
  // are rejected here — the tip UI never lands on a "read more" preview.
  const map = mapPage();
  try {
    document.documentElement.setAttribute('data-nibgate-kind', map.kind);
    document.documentElement.setAttribute('data-nibgate-type', map.contentType);
    document.documentElement.setAttribute('data-nibgate-eligible', map.eligibility?.kind === 'select' ? '1' : '0');
    document.documentElement.setAttribute('data-nibgate-reason', map.kindDecision.reasons[0] || '');
  } catch {}

  const eligible = map.eligibility ? map.eligibility.kind === 'select' : map.kind === 'content';

  let content: CardInput['content'] | null = null;
  if (map.kind === 'content' && eligible) {
    content = {
      url: window.location.href.split('#')[0],
      canonicalUrl: map.canonical || window.location.href.split('#')[0],
      title: map.title,
      author: map.author,
      siteName: map.siteName,
    };
  }

  // Low-confidence escalation: the deterministic page model owns the clear-cut
  // cases. When it is inconclusive — an unknown kind, or a content page it
  // could not bind to a tippable region — ask the hub's JEV model whether this
  // is creator content. Only a confident "yes" renders a card; a coin flip
  // stays silent, so we never invent a tip surface on an app/landing page.
  if (!content && (map.kind === 'unknown' || (map.kind === 'content' && !eligible))) {
    try {
      const fallback = extractContent();
      const words = (document.body?.innerText || '').trim().split(/\s+/).filter(Boolean).length;
      if (fallback && words >= 200) {
        const state = [
          `URL: ${window.location.href.split('#')[0]}`,
          `Title: ${map.title || document.title || ''}`,
          `Site: ${map.siteName || ''}`,
          `Detected kind: ${map.kind} (${map.kindDecision.reasons[0] || 'no reason'})`,
          `Word count: ${words}`,
          `Byline present: ${map.author ? `yes (${map.author})` : 'no'}`,
          `Paragraphs: ${document.querySelectorAll('article p, main p, p').length}`,
          `Excerpt: ${(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600)}`,
        ].join('\n').slice(0, 4000);
        const verdict = await chrome.runtime.sendMessage({ type: 'JEV_CLASSIFY', state });
        try {
          document.documentElement.setAttribute('data-nibgate-jev', String(verdict?.probability ?? ''));
        } catch {}
        if (verdict?.ok && Number(verdict.probability) >= 0.65) {
          content = fallback;
        }
      }
    } catch {}
  }
  if (!content) return null;

  const pageWallet = recipientWalletFromPage();
  const hasSdk = hasNibgateSdk();
  let isMainnet = false;
  try {
    const stored = await chrome.storage.local.get(['nibgateNetwork', 'nibTipNetwork']);
    isMainnet = stored.nibgateNetwork === 'mainnet' || stored.nibTipNetwork === 'mainnet';
  } catch {}
  let state: 'resolved' | 'held' | 'unknown' = hasSdk ? 'resolved' : 'unknown';
  try {
    const assessment = await chrome.runtime.sendMessage({ type: 'ASSESS', content, pageWallet, hasSdk });
    if (assessment?.resolution?.state === 'resolved') state = 'resolved';
    else if (assessment) state = 'held';
  } catch {
    state = hasSdk ? 'resolved' : 'held';
  }
  return { content, pageWallet, hasSdk, isMainnet, state, end: map.anchor ?? map.end, root: map.root };
}

function renderCard(input: CardInput, runId: string): void {
  if (document.querySelector(`[${HOST_ATTR}]`)) return;
  const container = input.root ?? contentContainer();
  statusEls = [];
  const mount = (floating: boolean) => {
    const host = document.createElement('div');
    host.setAttribute(HOST_ATTR, floating ? 'floating' : 'inline');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = cardMarkup(floating);
    shadow.getElementById(CARD_ID)?.setAttribute('data-run', runId);
    const status = shadow.querySelector<HTMLElement>('[data-tip-status]');
    if (status) statusEls.push(status);
    shadow.querySelector('[data-open-tip]')?.addEventListener('click', async () => {
      if (tipBusy) return;
      tipBusy = true;
      const buttons = Array.from(document.querySelectorAll(`[${HOST_ATTR}]`))
        .map((widget) => widget.shadowRoot?.querySelector<HTMLButtonElement>('[data-open-tip]')).filter(Boolean);
      buttons.forEach((button) => { button!.disabled = true; });
      try { await openTipWindow(input.content, input.pageWallet); }
      finally { tipBusy = false; buttons.forEach((button) => { button!.disabled = false; }); }
    });
    try { applyPageVisual(host, container); } catch {}
    return { host, shadow };
  };
  const floating = mount(true);
  document.documentElement.appendChild(floating.host);
  floating.shadow.querySelector('[data-dismiss-tip]')?.addEventListener('click', () => {
    (window as any).__nibgateDismissedUrl = window.location.href.split('#')[0];
    floating.host.remove();
    statusEls = statusEls.filter((el) => el.isConnected);
  });
  const inline = mount(false);
  let anchor = input.end;
  if (!anchor || /^H[1-6]$/.test(anchor.tagName)) {
    const blocks = Array.from(container.querySelectorAll('p,blockquote,pre,figure'))
      .filter((el) => !isBoilerplateZone(el) && ((el.textContent || '').trim().length >= 40 || el.tagName === 'FIGURE'));
    anchor = blocks[blocks.length - 1] ?? null;
  }
  if (anchor?.parentNode) anchor.parentNode.insertBefore(inline.host, anchor.nextSibling);
  else container.appendChild(inline.host);
  watchPageVisual(floating.host, container);
}

// The button opens the extension tip window (all money UI lives there).
// Afterwards the card polls for the receipt so the page shows the outcome.
async function openTipWindow(content: CardInput['content'], pageWallet: string) {
  const currentStatuses = [...statusEls];
  const say = (text: string) => {
    currentStatuses.filter((el) => el.isConnected).forEach((el) => { el.textContent = text; });
  };
  // Extension reloaded or page frozen (bfcache): the message channel is gone.
  // Bail quietly instead of throwing unchecked lastError noise.
  if (!chrome.runtime?.id) {
    say('Extension reloaded — refresh the page and try again.');
    return;
  }
  let candidateWallets: PageWalletCandidate[] = [];
  try { candidateWallets = recipientWalletsFromPage(); } catch { candidateWallets = []; }
  let opened: any;
  try {
    opened = await chrome.runtime.sendMessage({ type: 'TIP_OPEN', content, pageWallet, candidateWallets, hasSdk: hasNibgateSdk() });
  } catch {
    say('Extension error — reopen the popup and try again.');
    return;
  }
  if (!opened?.ok) {
    say(opened?.error || 'Tip failed to start.');
    return;
  }
  const id = String(opened.id || '');
  say('Continue in the extension window…');
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    if (!chrome.runtime?.id) return;
    let res: any = null;
    try {
      res = await chrome.runtime.sendMessage({ type: 'TIP_RESULT', id });
    } catch {
      return;
    }
    if (!res || !res.done) continue;
    if (res.ok) {
      if (res.held) {
        const waiting = res.heldCount ? ` (${res.heldCount} waiting · $${Number(res.heldTotal || 0).toFixed(2)})` : '';
        say(`Held for the creator ✓ ${String(res.txHash || '').slice(0, 10)}…${waiting}`);
      } else {
        say(`Tipped ✓ ${String(res.txHash || '').slice(0, 10)}…`);
      }
    } else {
      say(res.error || 'Cancelled.');
    }
    return;
  }
  say('Still waiting — reopen the extension window or check popup history.');
}

async function main() {
  const shared = window as any;
  shared.__nibgateCardCleanup?.();
  if(!isTippableUrl(window.location.href)){
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach(el=>el.remove());
    return;
  }
  if (shared.__nibgateCardResume) window.removeEventListener('pageshow', shared.__nibgateCardResume);
  shared.__nibgateCardResume = (event: PageTransitionEvent) => { if (event.persisted) void main(); };
  window.addEventListener('pageshow', shared.__nibgateCardResume);
  let keepalive: chrome.runtime.Port | null = null;
  try { keepalive = chrome.runtime.connect({ name: 'nibgate-keepalive' }); } catch {}
  const myRun = Math.random().toString(36).slice(2);
  shared.__nibgateCardRun = myRun;
  let pageUrl = window.location.href.split('#')[0];
  let pending: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let lastSignature = '';
  let stopped = false;
  const assess = async () => {
    if (stopped || busy || shared.__nibgateCardRun !== myRun) return;
    if (shared.__nibgateDismissedUrl === pageUrl || document.querySelector(`[${HOST_ATTR}]`)) return;
    const mediaSignature = Array.from(document.querySelectorAll('img,video,audio,iframe')).slice(0, 200)
      .map((el) => [el.getAttribute('src'), el.getAttribute('srcset'), el.getAttribute('width'), (el as HTMLImageElement).naturalWidth || 0].join(':')).join('|');
    const metadataSignature = Array.from(document.head.querySelectorAll('meta,link[rel="canonical"],script[type="application/ld+json"]'))
      .map((el) => el.getAttribute('content') || el.getAttribute('href') || el.textContent || '').join('|');
    const signature = pageUrl + document.title + mediaSignature + metadataSignature + (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    if (signature === lastSignature) return;
    lastSignature = signature;
    busy = true;
    const assessedUrl = pageUrl;
    try {
      const input = await assessState();
      if (stopped || shared.__nibgateCardRun !== myRun || window.location.href.split('#')[0] !== assessedUrl) return;
      document.documentElement.setAttribute('data-nibgate-assessed', '1');
      if (input) renderCard(input, myRun);
    } finally { busy = false; if (pageUrl !== assessedUrl) schedule(); }
  };
  const schedule = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => { void assess(); }, 1000);
  };
  // Hydrated and lazy-loaded articles often appear after document_idle.
  const observer = new MutationObserver((changes) => {
    if (changes.some((c) => !((c.target as Element).closest?.(`[${HOST_ATTR}]`)))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'width', 'height'] });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['content', 'href'] });
  // SPA navigation does not necessarily trigger a Chrome tab load event.
  const navigation = setInterval(() => {
    const next = window.location.href.split('#')[0];
    if (next === pageUrl) return;
    pageUrl = next;
    lastSignature = '';
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((el) => el.remove());
    themeObserver?.disconnect();
    statusEls = [];
    schedule();
  }, 1000);
  const retries = [1500, 4000, 10000].map((ms) => setTimeout(() => { void assess(); }, ms));
  const cleanup = () => {
    stopped = true;
    observer.disconnect();
    clearInterval(navigation);
    if (pending) clearTimeout(pending);
    retries.forEach(clearTimeout);
    try { keepalive?.disconnect(); } catch {}
    keepalive = null;
    document.removeEventListener('pagehide', cleanup);
  };
  shared.__nibgateCardCleanup = cleanup;
  document.addEventListener('pagehide', cleanup);
  try { await chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href }); } catch {}
  await assess();
}

void main();
