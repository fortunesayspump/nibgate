import { createEvmGatewayUnlock } from './evm-gateway.js';

const SID = 'nibgate-ui-styles';

const theme = {
  bg: 'var(--bg, #f4f4f0)',
  fg: 'var(--fg, #0a0a0a)',
  muted: 'var(--muted, #6b6862)',
  border: 'var(--border, #cecdc3)',
  accent: 'var(--accent, #7c9a6d)',
  accentSoft: 'var(--accent-soft, #d8e8d3)',
  cardHover: 'var(--card-hover, #e0ddd3)',
};

const css = (s) => Object.entries(s).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';');

function h(tag, attrs, children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') e.style.cssText = css(v);
    else if (k === 'cls') e.className = v;
    else e.setAttribute(k, String(v));
  }
  if (typeof children === 'string') e.innerHTML = children;
  else if (children) (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}

function inject() {
  if (document.getElementById(SID)) return;
  const s = h('style', { id: SID }, `
@keyframes nfade { from { opacity:0;transform:translateY(6px) } to { opacity:1;transform:translateY(0) } }
@keyframes nscale { from { opacity:0;transform:scale(0.96) } to { opacity:1;transform:scale(1) } }

.nui { font-family:var(--font-content,'Kumbh Sans','ABC Favorit',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif);color:${theme.fg};line-height:1.5;-webkit-font-smoothing:antialiased;font-size:19px }
.nui *,.nui *::before,.nui *::after { box-sizing:border-box }
.nui-btn { display:flex;align-items:center;justify-content:center;gap:8px;font-size:18px;font-weight:600;padding:14px 28px;border-radius:12px;cursor:pointer;transition:all.12s;font-family:inherit;line-height:1;border:none }
.nui-btn:disabled { opacity:0.35;cursor:default;pointer-events:none }
.nui-btn:focus-visible { outline:2px solid ${theme.accent};outline-offset:2px }
.nui-btn-primary { background:${theme.accent};color:${theme.bg} }
.nui-btn-primary:hover:not(:disabled) { opacity:0.9 }
.nui-btn-primary:active:not(:disabled) { transform:scale(.98) }
.nui-btn-outline { background:transparent;border:1px solid ${theme.border};color:${theme.fg} }
.nui-btn-outline:hover:not(:disabled) { border-color:${theme.accent};color:${theme.accent} }
.nui-input { padding:14px 16px;font-size:18px;border-radius:12px;border:1px solid ${theme.border};background:transparent;color:${theme.fg};width:100%;font-family:inherit;outline:none;transition:border-color.12s }
.nui-input:focus { border-color:${theme.accent} }
.nui-input::placeholder { color:${theme.muted} }
.nui-label { font-size:17px;font-weight:600;color:${theme.muted};margin-bottom:8px;display:block }
.nui-mono { font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace }
.nui-stat { font-size:18px;color:${theme.muted};line-height:1.4;min-height:28px }
.nui-stat-err { color:#dc2626 }
.nui-stat-ok { color:#16a34a }
`);
  document.head.appendChild(s);
}

function el(tag, a, c) { return h(tag, a, c); }

function status(el, msg) {
  if (!el) return;
  el.textContent = msg || '';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

export function renderDefaultUnlockUI(container, resource, options = {}) {
  inject();

  const card = el('div', { cls: 'nui', style: { animation: 'nfade .2s ease-out' } });

  const unlockSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

  card.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;max-width:580px;margin:0 auto;padding:40px 52px">
      <div id="nibgate-lottie" style="width:165px;height:168px;margin-bottom:24px"></div>
      <div style="font-size:50px;font-weight:700;letter-spacing:-.03em;color:${theme.fg};margin-bottom:12px">${esc(resource.price)} USDC</div>
      <div style="font-size:21px;color:${theme.muted};margin-bottom:48px">Pay to unlock this content</div>
      <div data-nibgate-wallet-label class="nui-mono" style="font-size:18px;color:${theme.muted};margin-bottom:40px;min-height:28px">Connect wallet</div>
      <div data-nibgate-unlock-wrap style="width:100%;position:relative;border-radius:10px;overflow:hidden;cursor:pointer">
        <div data-nibgate-unlock-progress style="position:absolute;inset:0;width:0%;background:${theme.accent};opacity:0.15;border-radius:10px;transition:width .05s linear;z-index:2"></div>
        <button type="button" data-nibgate-unlock disabled style="width:100%;padding:14px 0;font-size:17px;font-weight:600;line-height:1;border:0;border-radius:10px;outline:none;cursor:pointer;position:relative;z-index:4;color:#fff;background:${theme.accent};transition:box-shadow .3s,transform .3s;font-family:inherit;display:flex;align-items:center;justify-content:center">${unlockSVG}Hold to pay</button></div>
      <div class="nui-stat" style="text-align:center;margin-top:16px" data-nibgate-status></div>
    </div>
    <div data-nibgate-premium hidden style="margin-top:32px;border-top:1px solid ${theme.border};padding-top:32px">${options.premiumContentHTML || ''}</div>
  `;

  (typeof container === 'string' ? document.querySelector(container) : container)?.appendChild(card);
  // Load Lottie animation
  (function loadLottie() {
    if (!document.getElementById('nibgate-lottie')) return;
    function startAnim(data) {
      var d = document.getElementById('nibgate-lottie');
      if (d && window.lottie) window.lottie.loadAnimation({ container: d, animationData: data, loop: true, autoplay: true });
    }
    if (window.lottie) {
      if (window._lottieData) startAnim(window._lottieData);
      else fetch('/nibgate-unlock-key.json?t=1').then(function(r) { if (!r.ok) throw new Error(); return r.json(); }).then(function(d) { window._lottieData = d; startAnim(d); }).catch(function() {});
      return;
    }
    if (window._lottieLoading) return;
    window._lottieLoading = true;
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
    s.onload = function() {
      fetch('/nibgate-unlock-key.json?t=1').then(function(r) { if (!r.ok) throw new Error(); return r.json(); }).then(function(d) { window._lottieData = d; startAnim(d); }).catch(function() {});
    };
    document.head.appendChild(s);
  })();

  const st = card.querySelector('[data-nibgate-status]');
  const label = card.querySelector('[data-nibgate-wallet-label]');
  const wrap = card.querySelector('[data-nibgate-unlock-wrap]');
  const prog = card.querySelector('[data-nibgate-unlock-progress]');
  const btn = card.querySelector('[data-nibgate-unlock]');

  const HOLD_MS = 1500;
  let holdTimer = null, holdActive = false, holdComplete = false;

  const ctrl = createEvmGatewayUnlock(resource, {
    ...options,
    connectButton: null,
    unlockButton: null,
    walletLabel: null,
    status: '[data-nibgate-status]',
    unlockedTarget: '[data-nibgate-premium]',
    onStatus: (msg) => status(st, msg),
    onUnlock: options.premiumContentUrl ? async () => {
      const premiumEl = card.querySelector('[data-nibgate-premium]');
      if (!premiumEl) return;
      premiumEl.innerHTML = 'Loading content...';
      try {
        const res = await fetch(options.premiumContentUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        premiumEl.innerHTML = html;
      } catch {
        premiumEl.innerHTML = 'Could not load premium content. Refresh and try again.';
      }
    } : options.onUnlock,
  });

  function shortAddress(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''; }

  function updateLabel() {
    const addr = ctrl.getWalletAddress();
    if (addr) {
      label.innerHTML = shortAddress(addr) + ' <span data-nibgate-disconnect style="cursor:pointer">· Disconnect</span>';
      btn.disabled = false;
      btn.style.cursor = 'pointer';
    } else {
      label.textContent = 'Connect wallet';
      btn.disabled = true;
      btn.style.cursor = 'default';
      btn.innerHTML = unlockSVG + 'Hold to pay';
    }
  }

  function setBtnText(t) { btn.innerHTML = unlockSVG + t; }

  function resetHold() {
    holdActive = false;
    holdComplete = false;
    holdTimer = null;
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
    prog.style.width = '0%';
    if (!btn.disabled) setBtnText('Hold to pay');
  }

  function startHold(e) {
    if (btn.disabled || holdActive) return;
    e.preventDefault();
    holdActive = true;
    holdComplete = false;
    btn.style.transform = 'scale(.97)';
    btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
    prog.style.transition = 'none';
    prog.style.width = '0%';
    setBtnText('Hold\u2026');
    requestAnimationFrame(() => {
      prog.style.transition = 'width ' + HOLD_MS + 'ms linear';
      prog.style.width = '100%';
    });
    holdTimer = setTimeout(() => {
      holdComplete = true;
      holdActive = false;
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      prog.style.transition = 'width .05s linear';
      setBtnText('Processing\u2026');
      btn.disabled = true;
      setTimeout(() => ctrl.unlock().then(updateLabel).catch(updateLabel), 300);
    }, HOLD_MS);
  }

  function cancelHold() {
    if (!holdActive || holdComplete) return;
    clearTimeout(holdTimer);
    resetHold();
  }

  label.addEventListener('click', (e) => {
    if (e.target.dataset.nibgateDisconnect !== undefined) {
      ctrl.disconnect().then(updateLabel);
    } else if (!ctrl.getWalletAddress()) {
      ctrl.connect().then(updateLabel).catch(() => updateLabel());
    }
  });

  wrap.addEventListener('mousedown', startHold);
  wrap.addEventListener('touchstart', startHold, { passive: false });
  document.addEventListener('mouseup', cancelHold);
  document.addEventListener('touchend', cancelHold);
  wrap.addEventListener('mouseleave', cancelHold);

  setTimeout(updateLabel, 200);

  const cleanup = () => { document.removeEventListener('mouseup', cancelHold); document.removeEventListener('touchend', cancelHold); };
  card.addEventListener('remove', cleanup);

  // ── Gateway balance + deposit icon ─────────────────────────────────────
  async function fetchBalance(addr) {
    try {
      const sel = '0xdd62e1c6';
      const pad = (a) => '000000000000000000000000' + a.slice(2).toLowerCase();
      const data = sel + pad('0x3600000000000000000000000000000000000000') + pad(addr);
      const hex = await window.ethereum.request({
        method: 'eth_call',
        params: [{ to: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9', data }, 'latest'],
      });
      return hex && hex !== '0x' ? (Number(BigInt(hex)) / 1_000_000).toFixed(2) + ' USDC' : '0.00 USDC';
    } catch { return '\u2014'; }
  }

  let balEl = null, gwOverlay = null, balTimer = null;

  function depIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle"><path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/></svg>';
  }

  function showDeposit() {
    if (gwOverlay) return;
    gwOverlay = el('div', { style: 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;animation:nfade .15s ease-out' });
    const modal = el('div', { style: 'background:' + theme.bg + ';border-radius:16px;max-width:540px;width:100%;max-height:90vh;overflow:auto;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.12);animation:nscale .15s ease-out' });
    const close = el('button', { style: 'position:absolute;top:12px;right:16px;z-index:20;background:none;border:none;font-size:28px;cursor:pointer;color:' + theme.muted + ';font-family:inherit;line-height:1' }, '\u00d7');
    close.addEventListener('click', () => { gwOverlay.remove(); gwOverlay = null; document.removeEventListener('keydown', onDepKey); });
    modal.appendChild(close);
    gwOverlay.appendChild(modal);
    gwOverlay.addEventListener('click', (e) => { if (e.target === gwOverlay) { gwOverlay.remove(); gwOverlay = null; document.removeEventListener('keydown', onDepKey); } });
    document.body.appendChild(gwOverlay);
    document.addEventListener('keydown', onDepKey);
    import('./default-ui.js').then(m => m.renderDefaultGatewayWalletUI(modal, options.gatewayOptions || {})).catch(() => {});
  }
  function onDepKey(e) { if (e.key === 'Escape' && gwOverlay) { gwOverlay.remove(); gwOverlay = null; document.removeEventListener('keydown', onDepKey); } }

  function ensureBal() {
    if (balEl && balEl.isConnected) return balEl;
    balEl = el('span', { 'data-nibgate-bal': '', style: 'margin-left:4px;cursor:pointer;white-space:nowrap;color:var(--accent,#7c9a6d)' },
      '\u00b7\u00a0<span data-nibgate-bal-txt></span>\u00a0|\u00a0' + depIcon());
    balEl.addEventListener('click', showDeposit);
    if (label.parentNode) label.parentNode.insertBefore(balEl, label.nextSibling);
    return balEl;
  }

  async function refreshBal() {
    if (!card.isConnected || !window.ethereum) return;
    try {
      const accts = await window.ethereum.request({ method: 'eth_accounts' });
      const addr = Array.isArray(accts) && accts[0] ? accts[0] : null;
      if (!addr) return;
      const t = ensureBal().querySelector('[data-nibgate-bal-txt]');
      if (t) t.textContent = await fetchBalance(addr);
    } catch {}
  }

  if (window.ethereum) {
    balTimer = setInterval(refreshBal, 3000);
    setTimeout(refreshBal, 1000);
    window.ethereum.on('accountsChanged', refreshBal);
  }

  return { ...ctrl, element: card, destroy: () => { cleanup(); card.remove(); if (balTimer) clearInterval(balTimer); if (gwOverlay) { gwOverlay.remove(); gwOverlay = null; } } };
}

export function renderDefaultRatingUI(container, resource, options = {}) {
  inject();

  let sel = 0, busy = false, ctrl = null, statusTimer = null;

  const wrap = el('div', { cls: 'nui', style: { animation: 'nfade .2s ease-out', textAlign: 'center', padding: '28px 0' } });

  const starRow = el('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' } });
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const b = el('button', {
      type: 'button', 'aria-label': `${i} star${i > 1 ? 's' : ''}`,
      'data-star': i,
      style: {
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '4px', fontSize: '31px', lineHeight: '1',
        color: theme.border, transition: 'color .12s, transform .12s',
        borderRadius: '4px',
        fontFamily: 'inherit',
      },
    }, '☆');
    stars.push(b);
    starRow.appendChild(b);
  }

  const avgEl = el('span', { style: { fontSize: '17px', color: theme.muted, marginLeft: '12px' } });
  avgEl.textContent = 'No ratings yet';
  starRow.appendChild(avgEl);

  const st = el('div', { style: { fontSize: '17px', color: theme.muted, marginTop: '8px', minHeight: '1.4em' } });
  st.textContent = 'Tap stars to rate';

  wrap.append(starRow, st);

  (typeof container === 'string' ? document.querySelector(container) : container)?.appendChild(wrap);

  function clearStatus() {
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    st.textContent = sel > 0 ? '' : 'Tap stars to rate';
    st.style.color = theme.muted;
  }

  function setStatus(msg, color, autoClear) {
    st.textContent = msg || '';
    st.style.color = color || '';
    if (autoClear) statusTimer = setTimeout(clearStatus, autoClear);
  }

  function fill(h) {
    stars.forEach((b, i) => {
      const active = i < h;
      b.style.color = active ? theme.accent : theme.border;
      b.textContent = active ? '★' : '☆';
      b.style.transform = active ? 'scale(1.08)' : 'scale(1)';
    });
  }

  function setPrompt(v) {
    const labels = ['', 'Poor', 'Below average', 'Average', 'Good', 'Excellent'];
    setStatus(labels[v]);
  }

  async function rate(v) {
    if (busy || !ctrl) return;
    busy = true;
    stars.forEach(b => { b.disabled = true; b.style.cursor = 'default'; });
    sel = v;
    fill(v);
    setStatus('Submitting\u2026');
    try {
      await ctrl.rate({ rating: v });
      fill(v);
      setStatus('You rated ' + v + ' \u2605'.repeat(v), theme.accent, 3000);
      refresh();
    } catch (e) {
      setStatus(e?.message || 'Could not save rating. Try again.', '#dc2626');
      fill(sel);
    } finally {
      busy = false;
      stars.forEach(b => { b.disabled = false; b.style.cursor = 'pointer'; });
    }
  }

  function refresh() {
    const u = options.statsUrl || (resource.id ? `${options.apiBase || '/api'}/rating/${resource.id}` : null);
    if (!u) return;
    fetch(u).then(r => r.json()).then(d => {
      if (d.count > 0) {
        avgEl.textContent = `${d.average.toFixed(1)} \u2014 ${d.count} rating${d.count !== 1 ? 's' : ''}`;
      } else {
        avgEl.textContent = 'No ratings yet';
      }
    }).catch(() => {});
  }

  stars.forEach(b => {
    const v = parseInt(b.dataset.star);
    b.addEventListener('mouseenter', () => {
      if (!busy) { fill(v); setPrompt(v); }
    });
    b.addEventListener('mouseleave', () => {
      if (!busy) { fill(sel); clearStatus(); }
    });
    b.addEventListener('click', () => rate(v));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rate(v); } });
  });

  import('./rating-ui.js').then(m => {
    ctrl = m.createOnchainRating(resource, {
      autoMount: false,
      contentId: options.contentId || '0x' + (resource.id || '').replace(/-/g, ''),
      onRated: (r) => { setStatus('Rating saved', theme.accent, 3000); refresh(); if (typeof options.onRated === 'function') options.onRated(r); },
      onError: (e) => { setStatus(e?.message || 'Could not save rating. Try again.', '#dc2626'); if (typeof options.onError === 'function') options.onError(e); },
    });
    refresh();
  }).catch(() => { setStatus('Could not load rating', '#dc2626'); });

  return { element: wrap, destroy: () => wrap.remove(), refresh, setRating: (v) => { sel = v; fill(v); } };
}

export function renderDefaultGatewayWalletUI(container, options = {}) {
  inject();
  let tab = 'deposit';

  const wrap = el('div', { cls: 'nui', style: { animation: 'nfade .2s ease-out', border: '1px solid ' + theme.border, borderRadius: '16px', padding: '28px' } });

  wrap.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:20px">
      <div data-gw-wallet-card style="flex:1;background:${theme.bg};border:1px solid ${theme.border};border-radius:12px;padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:12px;font-weight:600;color:${theme.muted};letter-spacing:.02em">Wallet</div>
          <button data-gw-connect style="font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${theme.accent};background:transparent;color:${theme.accent};border-radius:8px;padding:4px 12px;font-family:inherit">Connect</button>
        </div>
        <div data-gw-wallet-balance class="nui-mono" style="font-size:24px;font-weight:700;color:${theme.fg}">—</div>
      </div>
      <div style="flex:1;background:${theme.bg};border:1px solid ${theme.border};border-radius:12px;padding:16px">
        <div style="font-size:12px;font-weight:600;color:${theme.muted};margin-bottom:4px;letter-spacing:.02em">Gateway</div>
        <div data-gw-balance class="nui-mono" style="font-size:24px;font-weight:700;color:${theme.fg}">—</div>
      </div>
    </div>
    <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid ${theme.border}">
      <button data-tab="deposit" style="flex:1;padding:10px 0;font-size:15px;font-weight:600;cursor:pointer;border:none;background:transparent;color:${theme.fg};border-bottom:2px solid ${theme.accent};font-family:inherit">Deposit</button>
      <button data-tab="withdraw" style="flex:1;padding:10px 0;font-size:15px;font-weight:600;cursor:pointer;border:none;background:transparent;color:${theme.muted};border-bottom:2px solid transparent;font-family:inherit">Withdraw</button>
    </div>
    <div data-gw-form></div>
  `;

  (typeof container === 'string' ? document.querySelector(container) : container)?.appendChild(wrap);

  const formEl = wrap.querySelector('[data-gw-form]');
  const tabs = wrap.querySelectorAll('[data-tab]');

  function select(btns, t) {
    btns.forEach(b => {
      const on = b.dataset.tab === t;
      b.style.color = on ? theme.fg : theme.muted;
      b.style.borderBottomColor = on ? theme.accent : 'transparent';
    });
  }

  function render(t) {
    tab = t;
    select(tabs, t);
    if (t === 'deposit') {
      formEl.innerHTML = `
        <label class="nui-label">Amount (USDC)</label>
        <input type="number" step="0.01" min="0" placeholder="0.00" data-gw-deposit-amount class="nui-input" style="margin-bottom:16px">
        <button type="button" data-gw-deposit class="nui-btn nui-btn-primary" style="width:100%;padding:16px 28px;font-size:20px">Deposit</button>
        <div data-gw-tx class="nui-mono" style="font-size:12px;color:${theme.muted};word-break:break-all;margin-top:12px;display:none"></div>
      `;
    } else {
      formEl.innerHTML = `
        <label class="nui-label">Amount (USDC)</label>
        <input type="number" step="0.01" min="0" placeholder="0.00" data-gw-withdraw-amount class="nui-input" style="margin-bottom:16px">
        <button type="button" data-gw-withdraw class="nui-btn nui-btn-primary" style="width:100%;padding:16px 28px;font-size:20px">Withdraw to your wallet</button>
        <div data-gw-tx class="nui-mono" style="font-size:12px;color:${theme.muted};word-break:break-all;margin-top:12px;display:none"></div>
      `;
    }
  }

  render('deposit');
  tabs.forEach(b => b.addEventListener('click', () => render(b.dataset.tab)));

  return { element: wrap, destroy: () => wrap.remove(), switchTab: render };
}
