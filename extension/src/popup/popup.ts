// Popup: conventional wallet-extension shell.
//   Onboarding (welcome → create/import → backup) and Lock are full-screen.
//   The app has a fixed top bar (account chip + network + settings), a
//   scrollable body, and a Home/Activity/Settings tab bar.
import qrcode from 'qrcode-generator';
import { getNetwork, setNetwork, NETWORKS, type NetworkName } from '../lib/network';

let rail: 'wallet' | 'gateway' = 'wallet';
let lastBalances: { wallet: number | null; gateway: number | null } = { wallet: null, gateway: null };
let watchAddress = '';
let currentNetwork: NetworkName = 'testnet';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const shortAddress = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'No wallet');

// Pressing Enter in any of these inputs triggers the primary action.
function onEnter(ids: string[], action: () => void) {
  for (const id of ids) {
    $(id)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        action();
      }
    });
  }
}

function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── screen routing ────────────────────────────────────────────────────────
type AppScreen = 'home' | 'activity' | 'send' | 'receive' | 'deposit' | 'withdraw' | 'settings' | 'detail';

function showOnboarding(step: 'welcome' | 'create' | 'import' | 'backup' = 'welcome') {
  $('screen-onboard')!.hidden = false;
  $('screen-lock')!.hidden = true;
  $('app')!.hidden = true;
  for (const s of ['welcome', 'create', 'import', 'backup'] as const) {
    const el = $(`ob-${s}`);
    if (el) el.hidden = s !== step;
  }
  onboardError('');
}

function showLock() {
  $('screen-onboard')!.hidden = true;
  $('screen-lock')!.hidden = false;
  $('app')!.hidden = true;
  $('lock-password') && (($('lock-password') as HTMLInputElement).value = '');
}

function showApp(screen: AppScreen = 'home') {
  $('screen-onboard')!.hidden = true;
  $('screen-lock')!.hidden = true;
  $('app')!.hidden = false;
  showScreen(screen);
}

function showScreen(name: AppScreen) {
  const names: AppScreen[] = ['home', 'activity', 'send', 'receive', 'deposit', 'withdraw', 'settings', 'detail'];
  for (const s of names) {
    const el = $(`screen-${s}`);
    if (el) el.classList.toggle('on', s === name);
    if (el) el.hidden = s !== name;
  }
  const navFor: Partial<Record<AppScreen, 'home' | 'activity' | 'settings'>> = {
    home: 'home', activity: 'activity', settings: 'settings', detail: 'activity',
  };
  for (const nav of ['home', 'activity', 'settings'] as const) {
    $(`nav-${nav}`)?.classList.toggle('on', navFor[name] === nav);
  }
  $('screens')?.scrollTo?.({ top: 0 });
}

// ── account + network ─────────────────────────────────────────────────────
function paintAccount() {
  const addr = $('acctaddr');
  if (addr) addr.textContent = shortAddress(watchAddress);
}

// ── toast ───────────────────────────────────────────────────────────────────
let toastTimer: number | undefined;
function toast(msg: string) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1600);
}

function copyAddress(silent: string) {
  if (!watchAddress) return;
  const done = () => toast(silent);
  try {
    const p = navigator.clipboard?.writeText(watchAddress) as unknown as Promise<void> | undefined;
    if (p && typeof p.then === 'function') p.then(done).catch(() => {});
    else done();
  } catch {
    // Clipboard unavailable — no-op, address is visible on screen.
  }
}

async function paintNetwork() {
  const net = await getNetwork();
  currentNetwork = net;
  const main = net === 'mainnet';
  const pill = $('netpill');
  const pillTxt = $('netpill-txt');
  if (pillTxt) {
    pillTxt.textContent = main ? 'MAINNET' : 'TESTNET';
  } else if (pill) {
    pill.textContent = main ? 'MAINNET' : 'TESTNET';
  }
  if (pill) pill.classList.toggle('main', main);
  const balnet = $('balnet');
  if (balnet) balnet.textContent = main ? 'Arc' : 'Arc Testnet';
  const tokenSub = $('token-sub');
  if (tokenSub) tokenSub.textContent = main ? 'Arc dollar' : 'Arc testnet dollar';
  const about = $('about-line');
  if (about) about.textContent = main ? 'Nibgate extension · mainnet (real USDC)' : 'Nibgate extension · testnet default';
  $('netopt-testnet')?.classList.toggle('sel', !main);
  $('netopt-mainnet')?.classList.toggle('sel', main);
  ($('netopt-testnet') as HTMLElement | null)?.setAttribute('aria-checked', String(!main));
  ($('netopt-mainnet') as HTMLElement | null)?.setAttribute('aria-checked', String(main));
}

// ── network dropdown (header pill) ──────────────────────────────────────────
// The switcher lives here, not in Settings. Mainnet stays confirm-gated via
// inline two-tap — never a native confirm(), which steals focus and gets the
// popup killed before the switch runs.
let armMainnet = false;
let armTimer: number | undefined;

function setNetMenu(open: boolean) {
  const menu = $('netmenu');
  if (menu) menu.hidden = !open;
  const pill = $('netpill');
  if (pill) pill.setAttribute('aria-expanded', String(open));
  if (!open) disarmMainnet();
}

function disarmMainnet() {
  armMainnet = false;
  window.clearTimeout(armTimer);
  const d = $('netopt-mainnet-d');
  if (d) d.textContent = 'Real USDC · Arc';
}

async function switchNetwork(name: NetworkName) {
  await setNetwork(name);
  await paintNetwork();
  await paintBalances();
  toast(name === 'mainnet' ? 'Switched to Mainnet' : 'Switched to Testnet');
}

// ── balances ──────────────────────────────────────────────────────────────
function paintBalance() {
  const v = rail === 'wallet' ? lastBalances.wallet : lastBalances.gateway;
  const el = $('balance');
  if (el) {
    el.classList.remove('skeleton');
    el.textContent = fmt(v);
  }
  const asset = $('asset-amt');
  if (asset) asset.textContent = `${fmt(lastBalances.wallet)} USDC`;
  $('tab-wallet')?.classList.toggle('on', rail === 'wallet');
  $('tab-gateway')?.classList.toggle('on', rail === 'gateway');
  const hint = $('rail-hint');
  if (hint) hint.textContent = rail === 'wallet' ? 'Tips pay from your wallet.' : 'Tips pay via Circle Gateway.';
  paintRailMode();
}

// Home actions follow the active rail: wallet moves plain USDC
// (Send/Receive), Gateway moves ledger funds (Deposit/Withdraw).
function paintRailMode() {
  const gw = rail === 'gateway';
  const sendLabel = $('btn-send-label');
  if (sendLabel) sendLabel.textContent = gw ? 'Deposit' : 'Send';
  const receiveLabel = $('btn-receive-label');
  if (receiveLabel) receiveLabel.textContent = gw ? 'Withdraw' : 'Receive';
}

async function paintBalances() {
  const el = $('balance');
  if (el) {
    el.textContent = '0.00';
    el.classList.add('skeleton');
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: 'BALANCES' });
    if (res?.balances) lastBalances = res.balances;
    if (res?.address) {
      watchAddress = res.address;
      paintAccount();
    }
  } catch {
    lastBalances = { wallet: null, gateway: null };
  }
  paintBalance();
  const avail = $('send-avail');
  if (avail) avail.textContent = `Available (wallet): ${fmt(lastBalances.wallet)} USDC`;
}

// ── activity ──────────────────────────────────────────────────────────────
type HistoryItem = { type?: string; amount?: string; title?: string; txHash?: string; payerWallet?: string; recipientWallet?: string; timestamp?: string; domain?: string; status?: string };
let historyItems: HistoryItem[] = [];

function paintHistory(items: HistoryItem[], elId: string, limit?: number) {
  const el = $(elId);
  if (!el) return;
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) {
    el.innerHTML = '<div class="empty">No activity yet.</div>';
    return;
  }
  el.innerHTML = '';
  for (const h of shown) {
    const outgoing = h.type !== 'receive';
    const held = h.status === 'held';
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="dir ${outgoing ? 'out' : 'in'}">${outgoing ? '↑' : '↓'}</span>
      <div class="main">
        <div class="amt">${outgoing ? '−' : '+'}$${h.amount || '?'} USDC${held ? ' · held' : ''}</div>
        <div class="sub">${h.title || (outgoing ? 'Sent' : 'Received')}${h.txHash ? ` · ${String(h.txHash).slice(0, 10)}…` : ' · pending'}</div>
      </div>
      <span class="when">${timeAgo(h.timestamp)}</span>`;
    row.addEventListener('click', () => openDetail(h));
    el.append(row);
  }
}

function openDetail(item: HistoryItem) {
  const body = $('detail-body');
  if (body) {
    const explorer = NETWORKS[currentNetwork]?.explorer || '';
    const tx = item.txHash || '';
    const rows: Array<[string, string, boolean]> = [
      ['Amount', item.amount ? `$${item.amount} USDC` : '—', false],
      ['Type', item.title || item.type || 'payment', false],
      ['Transaction', tx || 'pending…', Boolean(tx && explorer)],
      ['Counterparty', item.recipientWallet || item.payerWallet || '—', false],
      ['Time', item.timestamp ? new Date(item.timestamp).toLocaleString() : '—', false],
    ];
    body.innerHTML = '';
    for (const [k, v, link] of rows) {
      const key = document.createElement('div');
      key.className = 'k2';
      key.textContent = k;
      const val = document.createElement('div');
      val.className = 'v2';
      if (link) {
        const a = document.createElement('a');
        a.href = `${explorer.replace(/\/+$/, '')}/tx/${tx}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = v;
        val.append(a);
      } else {
        val.textContent = v;
      }
      body.append(key, val);
    }
  }
  if (item.status === 'held' && item.domain) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:14px;';
    const btn = document.createElement('button');
    btn.textContent = 'Refund tip';
    btn.style.cssText = 'background:var(--surface-2);color:var(--danger);border:1px solid var(--border);border-radius:8px;padding:9px 14px;font-size:12px;font-weight:700;cursor:pointer;';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Refunding…';
      try {
        const res = await chrome.runtime.sendMessage({ type: 'TIP_REFUND', domain: item.domain, amount: Number(item.amount) || undefined });
        if (res?.ok) {
          btn.textContent = `Refunded ✓${res.refundTx ? ` ${String(res.refundTx).slice(0, 10)}…` : ''}`;
          item.status = 'refunded';
        } else if (res?.needsUnlock) {
          btn.textContent = 'Unlock wallet, then retry';
          btn.disabled = false;
        } else {
          btn.textContent = res?.error || 'Refund failed';
          btn.disabled = false;
        }
      } catch {
        btn.textContent = 'Refund failed';
        btn.disabled = false;
      }
    });
    wrap.append(btn);
    body?.append(wrap);
  }
  showScreen('detail');
}

// ── onboarding ────────────────────────────────────────────────────────────
function onboardError(msg: string) {
  const el = $('ob-error');
  if (el) el.textContent = msg;
}

function paintMnemonic(elId: string, phrase: string) {
  const wrap = $(elId);
  if (!wrap) return;
  wrap.innerHTML = '';
  phrase.trim().split(/\s+/).forEach((w, i) => {
    const cell = document.createElement('span');
    cell.textContent = `${i + 1}. ${w}`;
    wrap.append(cell);
  });
}

// ── receive QR ────────────────────────────────────────────────────────────
function paintQr(address: string) {
  const el = $('qr');
  if (!el) return;
  el.innerHTML = '';
  if (!address) return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(address);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
  } catch {
    el.textContent = '';
  }
}

// ── theme ─────────────────────────────────────────────────────────────────
type Theme = 'system' | 'light' | 'dark';

async function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  for (const t of ['system', 'light', 'dark'] as const) {
    $(`theme-${t}`)?.classList.toggle('sel', t === theme);
  }
}

// ── init ──────────────────────────────────────────────────────────────────
async function init() {
  await paintNetwork();

  // Theme (hub light/dark parity).
  let theme: Theme = 'system';
  try {
    const stored = await chrome.storage.local.get(['nibgateTheme']);
    if (stored.nibgateTheme === 'light' || stored.nibgateTheme === 'dark' || stored.nibgateTheme === 'system') theme = stored.nibgateTheme;
  } catch {}
  await applyTheme(theme);
  for (const t of ['system', 'light', 'dark'] as const) {
    $(`theme-${t}`)?.addEventListener('click', async () => {
      await chrome.storage.local.set({ nibgateTheme: t });
      await applyTheme(t);
    });
  }

  // Restore rail preference.
  try {
    const { nibgateRail } = await chrome.storage.local.get('nibgateRail');
    if (nibgateRail === 'gateway') rail = 'gateway';
  } catch {}

  // Decide the initial screen from vault state.
  let status: { hasVault?: boolean; unlocked?: boolean; address?: string } = {};
  try {
    status = await chrome.runtime.sendMessage({ type: 'VAULT_STATUS' });
  } catch {}
  watchAddress = status.address || '';
  if (status.unlocked && status.address) showApp('home');
  else if (status.hasVault) showLock();
  else showOnboarding('welcome');

  // ── onboarding wiring ──
  $('ob-create-btn')?.addEventListener('click', () => showOnboarding('create'));
  $('ob-import-btn')?.addEventListener('click', () => showOnboarding('import'));
  $('ob-create-back')?.addEventListener('click', () => showOnboarding('welcome'));
  $('ob-import-back')?.addEventListener('click', () => showOnboarding('welcome'));

  $('do-create')?.addEventListener('click', async () => {
    const pw = ($('new-password') as HTMLInputElement | null)?.value || '';
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_CREATE', password: pw });
    if (!res?.ok) return onboardError(res?.error || 'Create failed.');
    watchAddress = res.address;
    paintMnemonic('ob-mnemonic', res.mnemonic || '');
    const saved = $('ob-saved') as HTMLInputElement | null;
    const doneBtn = $('ob-done') as HTMLButtonElement | null;
    if (saved) saved.checked = false;
    if (doneBtn) doneBtn.disabled = true;
    showOnboarding('backup');
  });
  $('ob-copy-phrase')?.addEventListener('click', () => {
    const grid = $('ob-mnemonic');
    const phrase = grid ? Array.from(grid.querySelectorAll('span')).map((s) => s.textContent?.replace(/^\d+\.\s*/, '')).join(' ') : '';
    navigator.clipboard?.writeText(phrase).catch(() => {});
  });
  $('ob-done')?.addEventListener('click', async () => {
    paintAccount();
    showApp('home');
    await paintBalances();
  });
  $('do-import')?.addEventListener('click', async () => {
    const words = ($('imp-words') as HTMLTextAreaElement | null)?.value || '';
    const pw = ($('imp-password') as HTMLInputElement | null)?.value || '';
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_IMPORT', mnemonic: words, password: pw });
    if (!res?.ok) return onboardError(res?.error || 'Import failed.');
    watchAddress = res.address;
    paintAccount();
    showApp('home');
    await paintBalances();
  });

  // ── lock wiring ──
  $('lock-go')?.addEventListener('click', async () => {
    const pw = ($('lock-password') as HTMLInputElement | null)?.value || '';
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_UNLOCK', password: pw });
    const err = $('lock-error');
    if (!res?.ok) {
      if (err) err.textContent = res?.error || 'Unlock failed.';
      return;
    }
    if (err) err.textContent = '';
    watchAddress = res.address;
    paintAccount();
    showApp('home');
    await paintBalances();
  });

  // ── top bar ──
  // The network pill toggles the switcher dropdown (the switch lives here,
  // not in Settings). The bottom tab bar remains the way into Settings.
  $('netpill')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setNetMenu(!!$('netmenu')?.hidden);
  });
  document.addEventListener('click', (e) => {
    if ($('netmenu')?.hidden) return;
    if ((e.target as HTMLElement | null)?.closest?.('#netwrap')) return;
    setNetMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') setNetMenu(false);
  });
  $('netopt-testnet')?.addEventListener('click', async () => {
    setNetMenu(false);
    await switchNetwork('testnet');
  });
  $('netopt-mainnet')?.addEventListener('click', async () => {
    if (!armMainnet) {
      armMainnet = true;
      const d = $('netopt-mainnet-d');
      if (d) d.textContent = 'Tap again — spends real USDC!';
      toast('Mainnet spends real USDC. Tap again to confirm.');
      window.clearTimeout(armTimer);
      armTimer = window.setTimeout(disarmMainnet, 5000);
      return;
    }
    setNetMenu(false);
    await switchNetwork('mainnet');
  });
  $('acct-chip')?.addEventListener('click', () => copyAddress('Address copied'));
  // Backup checkbox: wired once here (never inside the create handler).
  ($('ob-saved') as HTMLInputElement | null)?.addEventListener('change', (e) => {
    const btn = $('ob-done') as HTMLButtonElement | null;
    if (btn) btn.disabled = !(e.target as HTMLInputElement).checked;
  });

  // ── home actions (rail-aware: wallet = Send/Receive, gateway = Deposit/Withdraw) ──
  $('btn-send')?.addEventListener('click', () => { rail === 'gateway' ? openDeposit() : openSend(); });
  $('btn-receive')?.addEventListener('click', () => { rail === 'gateway' ? openWithdraw() : openReceive(); });
  $('tab-wallet')?.addEventListener('click', () => { rail = 'wallet'; chrome.storage.local.set({ nibgateRail: 'transfer' }); paintBalance(); });
  $('tab-gateway')?.addEventListener('click', () => { rail = 'gateway'; chrome.storage.local.set({ nibgateRail: 'gateway' }); paintBalance(); });
  $('view-all-activity')?.addEventListener('click', () => showScreen('activity'));

  // ── tab bar ──
  $('nav-home')?.addEventListener('click', () => showScreen('home'));
  $('nav-activity')?.addEventListener('click', () => showScreen('activity'));
  $('nav-settings')?.addEventListener('click', () => showScreen('settings'));

  // ── back buttons ──
  $('detail-back')?.addEventListener('click', () => showScreen('activity'));
  $('send-back')?.addEventListener('click', () => showScreen('home'));
  $('receive-back')?.addEventListener('click', () => showScreen('home'));
  $('deposit-back')?.addEventListener('click', () => showScreen('home'));
  $('withdraw-back')?.addEventListener('click', () => showScreen('home'));

  // ── receive ──
  $('receive-copy')?.addEventListener('click', () => copyAddress('Address copied'));

  // ── send ──
  $('send-max')?.addEventListener('click', () => {
    const amt = $('send-amount') as HTMLInputElement | null;
    if (amt && lastBalances.wallet != null) amt.value = String(Math.max(0, lastBalances.wallet - 0.01));
  });
  $('send-review-btn')?.addEventListener('click', reviewSend);
  $('send-confirm')?.addEventListener('click', confirmSend);

  // ── gateway funding ──
  $('deposit-max')?.addEventListener('click', () => {
    const amt = $('deposit-amount') as HTMLInputElement | null;
    if (amt && lastBalances.wallet != null) amt.value = String(Math.max(0, lastBalances.wallet - 0.01));
  });
  $('withdraw-max')?.addEventListener('click', () => {
    // Gas for the mint is paid from the wallet balance, so the full gateway
    // balance is withdrawable.
    const amt = $('withdraw-amount') as HTMLInputElement | null;
    if (amt && lastBalances.gateway != null) amt.value = String(Math.max(0, lastBalances.gateway));
  });
  $('deposit-review-btn')?.addEventListener('click', () => reviewFunding('deposit'));
  $('deposit-confirm')?.addEventListener('click', confirmFunding);
  $('withdraw-review-btn')?.addEventListener('click', () => reviewFunding('withdraw'));
  $('withdraw-confirm')?.addEventListener('click', confirmFunding);

  // ── settings ──
  $('sec-lock')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'VAULT_LOCK' });
    watchAddress = '';
    lastBalances = { wallet: null, gateway: null };
    showLock();
  });
  $('sec-reveal')?.addEventListener('click', () => {
    const wrap = $('reveal-wrap');
    if (wrap) wrap.hidden = !wrap.hidden;
  });
  $('reveal-go')?.addEventListener('click', async () => {
    const pw = ($('reveal-password') as HTMLInputElement | null)?.value || '';
    const res = await chrome.runtime.sendMessage({ type: 'VAULT_REVEAL', password: pw });
    const out = $('reveal-out');
    if (!res?.ok) {
      if (out) { out.hidden = false; out.innerHTML = `<span style="color:var(--danger)">${res?.error || 'Reveal failed.'}</span>`; }
      return;
    }
    if (out) { out.hidden = false; }
    paintMnemonic('reveal-out', res.mnemonic || '');
  });

  // Enter-to-submit for every primary form.
  onEnter(['new-password'], () => $('do-create')?.click());
  onEnter(['imp-words', 'imp-password'], () => $('do-import')?.click());
  onEnter(['lock-password'], () => $('lock-go')?.click());
  onEnter(['reveal-password'], () => $('reveal-go')?.click());
  onEnter(['send-to', 'send-amount'], () => {
    const confirm = $('send-confirm');
    if (confirm && !confirm.hidden) confirm.click();
    else $('send-review-btn')?.click();
  });
  onEnter(['deposit-amount'], () => {
    const confirm = $('deposit-confirm');
    if (confirm && !confirm.hidden) confirm.click();
    else $('deposit-review-btn')?.click();
  });
  onEnter(['withdraw-amount'], () => {
    const confirm = $('withdraw-confirm');
    if (confirm && !confirm.hidden) confirm.click();
    else $('withdraw-review-btn')?.click();
  });

  // ── history ──
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    historyItems = history;
  } catch {
    historyItems = [];
  }
  paintHistory(historyItems, 'history', 3);
  paintHistory(historyItems, 'history-full');

  // Auto-hiding scrollbars: reveal while scrolling, then fade out.
  for (const el of Array.from(document.querySelectorAll('.scroll')) as HTMLElement[]) {
    let timer: number | undefined;
    el.addEventListener('scroll', () => {
      el.classList.add('scrolling');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove('scrolling'), 900);
    }, { passive: true });
  }

  if (!$('app')?.hidden) await paintBalances();
}

// ── send flow ─────────────────────────────────────────────────────────────
let pendingSend: { to: string; amount: string } | null = null;

async function openSend() {
  pendingSend = null;
  ($('send-to') as HTMLInputElement | null) && (($('send-to') as HTMLInputElement).value = '');
  ($('send-amount') as HTMLInputElement | null) && (($('send-amount') as HTMLInputElement).value = '');
  const rev = $('send-review'); if (rev) rev.hidden = true;
  const conf = $('send-confirm'); if (conf) conf.hidden = true;
  const revbtn = $('send-review-btn'); if (revbtn) revbtn.hidden = false;
  const err = $('send-error'); if (err) err.textContent = '';
  const avail = $('send-avail'); if (avail) avail.textContent = `Available (wallet): ${fmt(lastBalances.wallet)} USDC`;
  showScreen('send');
}

async function reviewSend() {
  const err = $('send-error');
  const to = ($('send-to') as HTMLInputElement | null)?.value.trim() || '';
  const amount = ($('send-amount') as HTMLInputElement | null)?.value.trim() || '';
  const setErr = (m: string) => { if (err) err.textContent = m; };
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return setErr('Enter a valid 0x recipient address.');
  if (!(Number(amount) > 0)) return setErr('Enter an amount above zero.');
  if (lastBalances.wallet != null && Number(amount) > lastBalances.wallet) return setErr('Amount exceeds your balance.');
  setErr('');
  pendingSend = { to, amount };
  let feeRow = '';
  try {
    const est = await chrome.runtime.sendMessage({ type: 'ESTIMATE_SEND_FEE', to, amountUsdc: Number(amount) });
    if (est?.feeUsdc) feeRow = `<div class="line"><span class="k">Network fee (est.)</span><span class="v">~$${est.feeUsdc} USDC</span></div>`;
  } catch {}
  const rev = $('send-review');
  if (rev) {
    rev.hidden = false;
    rev.innerHTML = `
      <div class="line"><span class="k">To</span><span class="v">${to}</span></div>
      <div class="line"><span class="k">Amount</span><span class="v">${Number(amount).toFixed(6)} USDC</span></div>
      ${feeRow}
      <div class="line"><span class="k">Network</span><span class="v">${currentNetwork === 'mainnet' ? 'Arc' : 'Arc Testnet'}</span></div>`;
  }
  const conf = $('send-confirm'); if (conf) conf.hidden = false;
  const revbtn = $('send-review-btn'); if (revbtn) revbtn.hidden = true;
}

async function confirmSend() {
  if (!pendingSend) return;
  const err = $('send-error');
  const conf = $('send-confirm') as HTMLButtonElement | null;
  if (conf) { conf.disabled = true; conf.textContent = 'Sending…'; }
  const res = await chrome.runtime.sendMessage({ type: 'SEND_USDC', to: pendingSend.to, amountUsdc: Number(pendingSend.amount) });
  if (!res?.ok) {
    if (err) err.textContent = res?.error || 'Send failed.';
    if (conf) { conf.disabled = false; conf.textContent = 'Confirm & send'; }
    return;
  }
  // Refresh history + balances, then home.
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    historyItems = history;
    paintHistory(historyItems, 'history', 3);
    paintHistory(historyItems, 'history-full');
  } catch {}
  await paintBalances();
  showScreen('home');
}

async function openReceive() {
  const addr = $('receive-addr');
  if (addr) addr.textContent = watchAddress || 'No wallet yet.';
  const net = await getNetwork();
  currentNetwork = net;
  const netLabel = $('receive-net');
  if (netLabel) netLabel.textContent = net === 'mainnet' ? 'Arc · eip155:5042' : 'Arc Testnet · eip155:5042002';
  paintQr(watchAddress);
  showScreen('receive');
}

// ── gateway funding flows ───────────────────────────────────────────────────
let pendingFunding: { kind: 'deposit' | 'withdraw'; amount: string } | null = null;

function fundingIds(kind: 'deposit' | 'withdraw') {
  return {
    amount: `${kind}-amount`, max: `${kind}-max`, avail: `${kind}-avail`,
    review: `${kind}-review`, reviewBtn: `${kind}-review-btn`,
    confirm: `${kind}-confirm`, error: `${kind}-error`,
  };
}

function openFunding(kind: 'deposit' | 'withdraw') {
  pendingFunding = null;
  const ids = fundingIds(kind);
  ($('deposit-amount') as HTMLInputElement | null) && ((($('deposit-amount') as HTMLInputElement).value = ''));
  ($('withdraw-amount') as HTMLInputElement | null) && ((($('withdraw-amount') as HTMLInputElement).value = ''));
  const bal = kind === 'deposit' ? lastBalances.wallet : lastBalances.gateway;
  const rev = $(ids.review); if (rev) rev.hidden = true;
  const conf = $(ids.confirm); if (conf) conf.hidden = true;
  const revbtn = $(ids.reviewBtn); if (revbtn) revbtn.hidden = false;
  const err = $(ids.error); if (err) err.textContent = '';
  const avail = $(ids.avail);
  if (avail) avail.textContent = `Available (${kind === 'deposit' ? 'wallet' : 'gateway'}): ${fmt(bal)} USDC`;
  showScreen(kind);
}

function openDeposit() { openFunding('deposit'); }
function openWithdraw() { openFunding('withdraw'); }

function reviewFunding(kind: 'deposit' | 'withdraw') {
  const ids = fundingIds(kind);
  const err = $(ids.error);
  const amount = (($(ids.amount) as HTMLInputElement | null)?.value.trim() || '');
  const setErr = (m: string) => { if (err) err.textContent = m; };
  if (!(Number(amount) > 0)) return setErr('Enter an amount above zero.');
  const bal = kind === 'deposit' ? lastBalances.wallet : lastBalances.gateway;
  if (bal != null && Number(amount) > bal) return setErr(`Amount exceeds your ${kind === 'deposit' ? 'wallet' : 'gateway'} balance.`);
  setErr('');
  pendingFunding = { kind, amount };
  const rev = $(ids.review);
  if (rev) {
    rev.hidden = false;
    rev.innerHTML = `
      <div class="line"><span class="k">Action</span><span class="v">${kind === 'deposit' ? 'Wallet → Gateway' : 'Gateway → Wallet'}</span></div>
      <div class="line"><span class="k">Amount</span><span class="v">${Number(amount).toFixed(6)} USDC</span></div>
      <div class="line"><span class="k">Network</span><span class="v">${currentNetwork === 'mainnet' ? 'Arc' : 'Arc Testnet'}</span></div>`;
  }
  const conf = $(ids.confirm); if (conf) conf.hidden = false;
  const revbtn = $(ids.reviewBtn); if (revbtn) revbtn.hidden = true;
}

async function confirmFunding() {
  if (!pendingFunding) return;
  const { kind, amount } = pendingFunding;
  const ids = fundingIds(kind);
  const err = $(ids.error);
  const conf = ($(ids.confirm)) as HTMLButtonElement | null;
  if (conf) { conf.disabled = true; conf.textContent = kind === 'deposit' ? 'Depositing…' : 'Withdrawing…'; }
  const res = await chrome.runtime.sendMessage({
    type: kind === 'deposit' ? 'GATEWAY_DEPOSIT' : 'GATEWAY_WITHDRAW',
    amountUsdc: Number(amount),
  });
  const doneLabel = kind === 'deposit' ? 'Confirm & deposit' : 'Confirm & withdraw';
  if (!res?.ok) {
    if (err) err.textContent = res?.error || (kind === 'deposit' ? 'Deposit failed.' : 'Withdraw failed.');
    if (conf) { conf.disabled = false; conf.textContent = doneLabel; }
    return;
  }
  toast(kind === 'deposit' ? 'Deposited to Gateway' : 'Withdrew to wallet');
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    historyItems = history;
    paintHistory(historyItems, 'history', 3);
    paintHistory(historyItems, 'history-full');
  } catch {}
  await paintBalances();
  showScreen('home');
}

init();
