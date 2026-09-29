// Content script: runs on every http(s) page (minus Nibgate hosts).
// Detects the page's content, then embeds an inline tip widget INTO that
// content container — like native widgets, not a detached corner overlay.
// Rendered in a Shadow DOM so the host page's CSS can never break it (and
// ours never leaks out). No wallet code here: signing happens in the worker.
import { extractContent, contentContainer, isBoilerplateZone, recipientWalletFromPage, recipientWalletsFromPage, hasNibgateSdk } from './extract';
import type { PageWalletCandidate } from './extract';
import { mapPage } from './page-model';
import { isTippableUrl } from './guard';

const CARD_ID = 'nibgate-card';
const HOST_ATTR = 'data-nibgate-widget';

// Research-backed presets: impulse / highlighted default / fan.
const PRESETS = ['1', '5', '10'];
const HIGHLIGHTED = '5';

type CardInput = {
  content: { url: string; canonicalUrl: string; title: string; author: string; siteName: string; excerptTail?: string };
  pageWallet: string;
  hasSdk: boolean;
  isMainnet: boolean;
  state: 'resolved' | 'held' | 'unknown';
  end?: Element | null;
  kind?: string;
};

// Module ref into the shadow tree (document.getElementById can't see into it).
let statusEl: HTMLElement | null = null;

function fontUrl(file: string): string {
  try {
    return chrome.runtime.getURL(`fonts/${file}`);
  } catch {
    return '';
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
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
        applyPageVisual(host, container);
      } catch {}
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    themeObserver.observe(container, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  } catch {}
}

function shadowStyles(): string {
  const kumbh = fontUrl('KumbhSans-Regular.woff2');
  const kumbh600 = fontUrl('KumbhSans-SemiBold.woff2');
  const kumbh700 = fontUrl('KumbhSans-Bold.woff2');
  return `
    @font-face { font-family:'Kumbh Sans'; src:url('${kumbh}') format('woff2'); font-weight:400; }
    @font-face { font-family:'Kumbh Sans'; src:url('${kumbh600}') format('woff2'); font-weight:600; }
    @font-face { font-family:'Kumbh Sans'; src:url('${kumbh700}') format('woff2'); font-weight:700; }
    :host { all: initial; display: block; width: 100%; flex: 0 0 100%; --bg:#f4f4f0; --surface:#ffffff; --surface-2:#f0eee6; --border:#11111124; --fg:#0a0a0a; --muted:#44423d; --accent:#7c9a6d; --accent-ink:#10110e; --gold:#ffc900; --danger:#ff3e30; }
    @media (prefers-color-scheme: dark) {
      :host { --bg:#171813; --surface:#20221c; --surface-2:#242820; --border:#f3efe729; --fg:#f4f4f0; --muted:#b9b2a6; --accent:#a9c69a; --danger:#ff5b4d; }
    }
    .card { box-sizing:border-box; background:var(--wc-bg, var(--surface)); color:var(--wc-fg, var(--fg)); border:1px solid var(--wc-border, var(--border)); border-left:3px solid var(--accent); border-radius:8px; padding:14px 16px; margin:24px 0; max-width:640px;
      font-family:var(--wc-font, 'Kumbh Sans','ABC Favorit',system-ui,sans-serif); font-size:var(--wc-size, 14px); font-weight:400; line-height:1.45; box-shadow:0 1px 2px rgba(0,0,0,.06); }
    .brand { font-size:10px; font-weight:700; letter-spacing:.1em; color:var(--wc-muted, var(--muted)); text-transform:uppercase; }
    .brand b { color:var(--accent); }
    .line { font-size:1em; font-weight:600; margin:6px 0 2px; }
    .site { font-size:.86em; color:var(--wc-muted, var(--muted)); margin-bottom:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; }
    .row button { flex:1 1 0; min-width:56px; cursor:pointer; font-family:var(--wc-font, 'Kumbh Sans',system-ui,sans-serif); font-size:var(--wc-size, 14px); font-weight:700;
      border:1px solid var(--wc-border, var(--border)); background:transparent; color:var(--wc-fg, var(--fg)); border-radius:6px; padding:9px 8px; }
    .row button:hover { border-color:var(--wc-fg, var(--muted)); }
    .row button.hi { background:var(--accent); color:var(--accent-ink); border-color:transparent; }
    .foot { font-size:.79em; color:var(--wc-muted, var(--muted)); margin-top:9px; }
    [data-tip-status] { font-size:.86em; color:var(--accent); margin-top:6px; min-height:1.2em; }
  `;
}

function cardMarkup(input: CardInput): string {
  const { content, state, isMainnet } = input;
  const stateLine =
    state === 'resolved'
      ? `Tip the creator of “${escapeHtml(content.title)}”`
      : state === 'held'
        ? `Creator not on Nibgate yet — your tip is held for them`
        : `Looking up this content…`;
  const net = isMainnet ? 'MAINNET' : 'TESTNET';
  const foot = isMainnet ? 'real USDC' : 'play money (testnet)';
  return `
    <style>${shadowStyles()}</style>
    <div id="${CARD_ID}" class="card" data-state="${state}">
      <div class="brand">Nibgate · <b>${net}</b></div>
      <div class="line">${stateLine}</div>
      <div class="site">${escapeHtml(content.siteName)}</div>
      <div class="row">
        ${PRESETS.map((a) => `<button data-tip="${a}" class="${a === HIGHLIGHTED ? 'hi' : ''}">$${a}</button>`).join('')}
        <button data-tip="custom">Custom</button>
      </div>
      <div class="foot">Suggested: $${HIGHLIGHTED} · ${foot}</div>
      <div data-tip-status></div>
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
  const placementEnd = map.anchor ?? map.end;

  let content: CardInput['content'] | null = null;
  if (map.kind === 'content' && eligible && placementEnd) {
    content = {
      url: window.location.href.split('#')[0],
      canonicalUrl: map.canonical || window.location.href.split('#')[0],
      title: map.title,
      author: map.author,
      siteName: map.siteName,
    };
  } else if (map.kind === 'content' && eligible) {
    // Content page whose boundaries we could not map: fall back to Readability
    // for metadata + placement. Inconclusive/unknown pages are not tipped.
    const fallback = extractContent();
    if (fallback) content = fallback;
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
  return { content, pageWallet, hasSdk, isMainnet, state, end: map.kind === 'content' ? map.end : null, kind: map.kind };
}

// Placement uses the same practitioner-tested ideas as mainstream extraction
// libraries: sanitize boilerplate by landmark and Readability-style unlikely
// classes, inspect content blocks rather than raw wrappers, and anchor a live
// element against Readability's canonical article text.
const CONTENT_BLOCK_SELECTOR = 'h1, h2, h3, p, blockquote, pre, figure, figcaption';
const MIN_CONTENT_BLOCK_WORDS = 8;
const READABILITY_ANCHOR_WORDS = 120;
const MIN_ANCHOR_WORDS = 12;
const MIN_ANCHOR_SUFFIX_MATCH = 10;

function normalizeAnchorText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleContentBlock(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest(`[${HOST_ATTR}]`) || isBoilerplateZone(element)) return false;
  const text = normalizeAnchorText(element.textContent || '');
  if (text.split(' ').filter(Boolean).length < MIN_CONTENT_BLOCK_WORDS) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function liveContentBlocks(container: Element): HTMLElement[] {
  return Array.from(container.querySelectorAll(CONTENT_BLOCK_SELECTOR)).filter(visibleContentBlock);
}

function suffixMatchLength(blockWords: string[], tailWords: string[]): number {
  const limit = Math.min(blockWords.length, tailWords.length);
  let match = 0;
  while (match < limit && blockWords[blockWords.length - 1 - match] === tailWords[tailWords.length - 1 - match]) {
    match += 1;
  }
  return match;
}

// Match one live page block to the end of Readability’s sanitized article.
// This prefers the actual conclusion, even when a noisy sidebar, shop widget,
// or footer comes later in DOM order.
function findContentEndAnchor(container: Element, excerptTail?: string): HTMLElement | null {
  const tailWords = normalizeAnchorText(excerptTail || '').split(' ').filter(Boolean).slice(-READABILITY_ANCHOR_WORDS);
  if (tailWords.length < MIN_ANCHOR_WORDS) return null;
  const blocks = liveContentBlocks(container);
  let best: HTMLElement | null = null;
  let bestScore = MIN_ANCHOR_SUFFIX_MATCH - 1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const words = normalizeAnchorText(blocks[i].textContent || '').split(' ').filter(Boolean);
    if (words.length < MIN_CONTENT_BLOCK_WORDS) continue;
    const score = suffixMatchLength(words, tailWords);
    if (score > bestScore) {
      best = blocks[i];
      bestScore = score;
    }
  }
  return best;
}

function fallbackContentEnd(container: Element): HTMLElement | null {
  const blocks = liveContentBlocks(container);
  return blocks.length ? blocks[blocks.length - 1] : null;
}

function placementParent(anchor: Element | null, container: Element): { parent: Node; before: ChildNode | null } {
  if (anchor?.parentNode) return { parent: anchor.parentNode, before: anchor.nextSibling };
  return { parent: container, before: null };
}

function renderCard(input: CardInput, runId: string): void {
  // One widget per page: dedupe on the host element in the page DOM.
  if (document.querySelector(`[${HOST_ATTR}]`)) return;

  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = cardMarkup(input);
  const card = shadow.getElementById(CARD_ID);
  if (card) card.setAttribute('data-run', runId);
  statusEl = shadow.querySelector('[data-tip-status]');

  // Embed inside the detected content container (native placement), falling
  // back to body only when there is no content element.
  const container = input.end?.parentElement ?? contentContainer();
  try {
    applyPageVisual(host, container);
  } catch {}
  // Prefer the mapped content end from the deterministic page model (that is
  // where the actual piece finishes); only fall back to the block scan when the
  // model did not produce an end anchor.
  let inserted = false;
  if (input.end?.parentNode) {
    try {
      input.end.parentNode.insertBefore(host, input.end.nextSibling);
      inserted = true;
    } catch {}
  }
  // Legacy fallback: insert after the last substantial visible block rather
  // than blindly appending to a container that may include footers or widgets.
  if (!inserted) {
    const blocks = Array.from(container.querySelectorAll('h1, h2, h3, p, blockquote, pre, figure'));
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (!(block instanceof HTMLElement) || block.closest(`[${HOST_ATTR}]`) || isBoilerplateZone(block)) continue;
      const text = (block.textContent || '').trim();
      if (text.length < 80) continue;
      const style = window.getComputedStyle(block);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const parent = block.parentNode;
      if (!parent) continue;
      try {
        parent.insertBefore(host, block.nextSibling);
        inserted = true;
        break;
      } catch {
        continue;
      }
    }
  }
  if (!inserted) {
    try {
      container.appendChild(host);
    } catch {
      document.body.appendChild(host);
    }
  }

  shadow.querySelectorAll('[data-tip]').forEach((btn) =>
    btn.addEventListener('click', () => {
      startTipFlow((btn as HTMLElement).dataset.tip || '', input.content, input.pageWallet);
    }),
  );
  watchPageVisual(host, container);
}

// Consequence design: amount/recipient/network are shown for review BEFORE
// anything signs. Confirm sends TIP_CONFIRM (worker signs + settles).
async function startTipFlow(amount: string, content: CardInput['content'], pageWallet: string) {
  const say = (text: string) => {
    if (statusEl) statusEl.textContent = text;
  };
  let tipAmount = amount;
  if (amount === 'custom') {
    const entered = window.prompt('Tip amount in USDC', '5');
    if (entered === null) {
      say('Cancelled.');
      return;
    }
    const value = Number(entered);
    if (!(value > 0)) {
      say('Enter a positive amount.');
      return;
    }
    tipAmount = String(value);
  }
  say('Preparing tip…');
  let started: any;
  // DOM candidate wallets for the worker's JEV fallback: when nothing
  // resolves locally, the hub model scores these (rules first, LLM only here).
  let candidateWallets: PageWalletCandidate[] = [];
  try { candidateWallets = recipientWalletsFromPage(); } catch { candidateWallets = []; }
  try {
    started = await chrome.runtime.sendMessage({ type: 'TIP_START', amount: tipAmount, content, pageWallet, candidateWallets, hasSdk: hasNibgateSdk() });
  } catch {
    say('Extension error — reopen the popup and try again.');
    return;
  }
  if (!started?.ok) {
    say(started?.error || 'Tip failed to start.');
    return;
  }
  if (started.needsUnlock) {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_UNLOCK' }).catch(() => {});
    } catch {}
    say('Unlock the extension, then tap a preset again.');
    return;
  }
  const review = started.review || {};
  const heldNote = started.held
    ? '\nThis creator is not on Nibgate yet — the tip is held in a no-key onchain box for them to claim.'
    : '';
  const inferredNote = !started.held && review.source === 'jev-model'
    ? '\nRecipient was inferred by the model from page signals — double-check it.'
    : '';
  const ok = window.confirm(
    `Tip $${review.amount || amount} USDC?\nTo: ${review.recipient || 'creator'}\nPay to: ${review.payee || ''}\nRail: ${review.rail || 'transfer'}${heldNote}${inferredNote}`,
  );
  if (!ok) {
    say('Cancelled.');
    return;
  }
  say('Paying… confirm in the extension if asked.');
  try {
    const done = await chrome.runtime.sendMessage({
      type: 'TIP_CONFIRM',
      contentUrl: review.contentUrl || content.canonicalUrl || content.url,
      title: review.title || content.title,
      amount: review.amount || amount,
      recipient: review.recipient,
      rail: review.rail,
      held: Boolean(started.held),
      domain: review.domain,
    });
    if (done?.ok) {
      if (done.held) {
        const waiting = done.heldCount ? ` (${done.heldCount} waiting · $${Number(done.heldTotal || 0).toFixed(2)})` : '';
        say(`Held for the creator ✓ ${String(done.txHash || '').slice(0, 10)}…${waiting}`);
      } else {
        say(`Tipped ✓ ${String(done.txHash || '').slice(0, 10)}…`);
      }
    } else {
      say(done?.error || 'Payment failed.');
    }
  } catch {
    say('Payment failed — no money moved unless a tx hash shows.');
  }
}

async function main() {
  // Keep the MV3 worker alive across the multi-step tip flow.
  try {
    chrome.runtime.connect({ name: 'nibgate-keepalive' });
  } catch {}
  // Single-winner claim: concurrent injections race here; only the latest
  // proceeds past assessment. Host dedupe in renderCard backs it up.
  const myRun = Math.random().toString(36).slice(2);
  (window as any).__nibgateCardRun = myRun;
  try {
    await chrome.runtime.sendMessage({ type: 'CONTENT_READY', url: window.location.href });
  } catch {}
  const input = await assessState();
  if ((window as any).__nibgateCardRun !== myRun) return;
  document.documentElement.setAttribute('data-nibgate-assessed', '1');
  if (input) renderCard(input, myRun);
}

main();
