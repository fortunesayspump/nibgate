// Tip window: the whole money flow lives in the extension (wallet-standard).
// Amount → challenge/review → approve → receipt. The page only holds a dumb
// trigger button; nothing about money renders there, so pages can't spoof it.
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const id = new URLSearchParams(window.location.search).get('id') || '';
let preset = '5';
let review: Record<string, string> | null = null;
let busy = false;
let explorer = '';

function err(msg: string) {
  const el = $('t-error');
  if (el) el.textContent = msg;
}

function ok(msg: string) {
  const el = $('t-ok');
  if (el) el.textContent = msg;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function showClose(okMsg?: string) {
  $('t-actions')!.hidden = true;
  const wrap = $('t-close-wrap');
  if (wrap) wrap.hidden = false;
  if (okMsg) ok(okMsg);
  $('t-close')?.addEventListener('click', () => window.close(), { once: true });
}

function currentAmount(): string {
  const custom = (($('t-custom') as HTMLInputElement | null)?.value || '').trim();
  if (custom) return custom;
  return preset;
}

function paintPresets() {
  document.querySelectorAll('#t-presets button').forEach((b) => {
    const on = (b as HTMLElement).dataset.amt === preset && !(($('t-custom') as HTMLInputElement | null)?.value || '').trim();
    (b as HTMLElement).classList.toggle('hi', on);
  });
}

async function init() {
  if (!id) {
    $('loading')!.hidden = true;
    err('Missing tip id.');
    return;
  }
  let data: any = null;
  try {
    data = await chrome.runtime.sendMessage({ type: 'TIP_GET', id });
  } catch {
    $('loading')!.hidden = true;
    err('Extension error — close and try again.');
    return;
  }
  if (!data?.ok) {
    $('loading')!.hidden = true;
    $('main')!.hidden = false;
    $('t-actions')!.hidden = true;
    err(String(data?.error || 'Unknown or expired tip.'));
    showClose();
    return;
  }
  const tip = data.tip || {};
  const net = data.network || {};
  explorer = String(net.explorer || '');
  $('loading')!.hidden = true;
  $('main')!.hidden = false;
  $('t-title')!.textContent = tip.held ? 'Tip (held for creator)' : 'Tip the creator';
  $('t-sub')!.textContent = `${tip.siteName || tip.domain || ''} · ${net.label || 'Testnet'} · ${(tip.rail || 'transfer') === 'gateway' ? 'Circle Gateway' : 'Wallet'}`.replace(/^ · /, '');
  const note = tip.held
    ? 'This creator is not on Nibgate yet — the tip is held in a no-key onchain box for them to claim.'
    : tip.source === 'jev-model'
      ? 'Recipient was inferred by the model from page signals — double-check it below.'
      : '';
  if (note) {
    const n = $('t-note');
    if (n) {
      n.textContent = note;
      n.hidden = false;
    }
  }

  document.querySelectorAll('#t-presets button').forEach((b) => {
    b.addEventListener('click', () => {
      preset = (b as HTMLElement).dataset.amt || '5';
      const custom = $('t-custom') as HTMLInputElement | null;
      if (custom) custom.value = '';
      review = null;
      paintReview();
      paintPresets();
      err('');
    });
  });
  $('t-custom')?.addEventListener('input', () => {
    review = null;
    paintReview();
    paintPresets();
    err('');
  });
  $('t-custom')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      $('t-continue')?.click();
    }
  });
  paintPresets();

  $('t-cancel')?.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'TIP_CANCEL', id });
    } catch {}
    window.close();
  }, { once: true });

  $('t-continue')?.addEventListener('click', onContinue);
}

function paintReview() {
  const box = $('t-review')!;
  if (!review) {
    box.hidden = true;
    box.innerHTML = '';
    const btn = $('t-continue');
    if (btn) btn.textContent = 'Continue';
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div class="line"><span class="k">Amount</span><span class="v">$${esc(review.amount)} USDC</span></div>
    <div class="line"><span class="k">To</span><span class="v">${esc(review.recipient || (review.held === '1' ? 'held for creator' : 'creator'))}</span></div>
    <div class="line"><span class="k">Pay to</span><span class="v">${esc(review.payee)}</span></div>
    <div class="line"><span class="k">Rail</span><span class="v">${esc(review.rail || 'transfer')}</span></div>
    ${review.gasFeeUsdc ? `<div class="line"><span class="k">Network fee (est.)</span><span class="v">~$${esc(review.gasFeeUsdc)} USDC</span></div>` : ''}`;
  const btn = $('t-continue');
  if (btn) btn.textContent = 'Approve & pay';
}

async function onContinue() {
  if (busy) return;
  err('');
  // Step 1: amount → challenge (review). Step 2: review → execute.
  if (!review) {
    const amount = currentAmount();
    if (!(Number(amount) > 0)) {
      err('Enter an amount above zero.');
      return;
    }
    busy = true;
    const btn = $('t-continue') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Preparing…';
    }
    try {
      const res = await chrome.runtime.sendMessage({ type: 'TIP_CHALLENGE', id, amount: String(Number(amount)) });
      if (!res?.ok) {
        err(String(res?.error || 'Could not prepare the tip.'));
      } else {
        const r = res.review || {};
        review = {
          amount: String(r.amount || amount),
          recipient: String(r.recipient || ''),
          payee: String(r.payee || r.payTo || r.box || ''),
          rail: String(r.rail || 'transfer'),
          held: res.held ? '1' : '',
          gasFeeUsdc: String(r.gasFeeUsdc || ''),
        };
        if (res.needsUnlock) {
          try {
            await chrome.runtime.sendMessage({ type: 'OPEN_UNLOCK' });
          } catch {}
          err('Unlock the extension, then continue again.');
          review = null;
        }
        paintReview();
      }
    } catch {
      err('Extension error — close and try again.');
    }
    busy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = review ? 'Approve & pay' : 'Continue';
    }
    return;
  }
  busy = true;
  const btn = $('t-continue') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Paying…';
  }
  try {
    const done = await chrome.runtime.sendMessage({ type: 'TIP_EXECUTE', id });
    if (done?.ok) {
      const tx = done.txHash ? ` · ${String(done.txHash).slice(0, 10)}…` : '';
      const waiting = done.held && done.heldCount ? ` (${done.heldCount} waiting)` : '';
      showClose(done.held ? `Held for the creator ✓${tx}${waiting}` : `Tipped ✓${tx}`);
      if (done.txHash && explorer) {
        const okEl = $('t-ok');
        if (okEl) {
          okEl.append(document.createElement('br'));
          const a = document.createElement('a');
          a.href = `${explorer.replace(/\/+$/, '')}/tx/${done.txHash}`;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'View on explorer';
          okEl.append(a);
        }
      }
    } else {
      err(String(done?.error || 'Payment failed.'));
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Approve & pay';
      }
    }
  } catch {
    err('Payment failed — no money moved unless a tx hash shows.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Approve & pay';
    }
  }
  busy = false;
}

init();
