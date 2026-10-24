import { createCircleGatewayBrowserAdapter } from './gateway.js';

// Browser tip flow: challenge → pay → proof. No access grant — the receipt
// IS the product. Works standalone (explicit recipient) or against the hub
// tip endpoints. Testnet by default; pass network/chainId for mainnet.
//
// Two rails depending on whether the creator resolves on Nibgate:
//   resolved   → direct tip, settled only after hub verification; standalone pending
//   unresolved → no-key holding box for the domain, status held (claimable by
//                the creator, refundable by the payer until claimed)

function normalizeApi(hubApi) {
  return String(hubApi || '').replace(/\/+$/, '');
}

async function resolveRecipient({ api, contentUrl, recipient }) {
  if (recipient) return recipient;
  if (!api || !contentUrl) return '';
  try {
    const res = await fetch(`${api}/hub/resolve?url=${encodeURIComponent(contentUrl)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.wallet || '';
  } catch (cause) {
    throw new Error(`Tip recipient lookup failed; no payment was made: ${cause.message}`, { cause });
  }
}

// Pay a resolved challenge. Returns { txHash, paymentSignature, paymentRail }.
// payAmount is always normalized to decimal USDC: gateway-rail challenges
// quote integer base units, transfer-rail challenges quote decimals.
async function payChallenge({ chal, signer, network }) {
  const accept = chal.accepts?.[0] || {};
  const payTo = accept.payTo || accept.recipient || chal.payTo || '';
  const rawAmount = accept.amount ?? chal.amount;
  const payNetwork = accept.network || network || 'eip155:5042002';
  if (network && payNetwork !== network) throw new Error('Tip challenge network does not match the requested network.');
  if (!payTo) throw new Error('tip challenge has no recipient.');
  if (!(Number(rawAmount) > 0)) throw new Error('tip challenge has no amount.');
  const gatewayQuoted =
    (chal.paymentRail || accept.rail || '') === 'gateway' ||
    accept.extra?.name === 'GatewayWalletBatched';
  const payAmount = gatewayQuoted ? Number(rawAmount) / 1e6 : rawAmount;
  if (!(Number(payAmount) > 0)) throw new Error('tip challenge has no amount.');
  let txHash = '';
  let paymentSignature = '';
  let paymentRail = chal.paymentRail || '';
  if (gatewayQuoted && signer?.signTypedData) {
    const adapter = await createCircleGatewayBrowserAdapter({ network: payNetwork, signer });
    const paid = await adapter.pay({ challenge: chal });
    txHash = paid?.transaction || paid?.txHash || '';
    paymentSignature = paid?.paymentSignature || paid?.signature || txHash;
    paymentRail = paymentRail || (paymentSignature && paymentSignature !== txHash ? 'gateway' : 'transfer');
  } else if (signer?.sendTransaction) {
    txHash = await signer.sendTransaction({ to: payTo, amount: payAmount, network: payNetwork });
    paymentSignature = txHash;
    paymentRail = 'transfer';
  } else {
    throw new Error(gatewayQuoted
      ? 'Gateway tips need signTypedData or sendTransaction.'
      : 'Transfer tips need a signer with sendTransaction.');
  }
  return { txHash, paymentSignature, paymentRail, payTo, payAmount, payNetwork };
}

export async function tipContent({ contentUrl, title, amount, currency = 'USDC', network, recipient, challenge, signer, hubApi, domain, contentId, websiteId, imageUrl }) {
  const api = normalizeApi(hubApi);
  const net = network || 'eip155:5042002';

  if (!challenge && !signer) throw new Error('tipContent needs a signer.');

  // Attempt to resolve the creator when the caller did not pin a recipient.
  const resolved = await resolveRecipient({ api, contentUrl, recipient })
    || (!api && challenge ? challenge.accepts?.[0]?.payTo || challenge.accepts?.[0]?.recipient || challenge.payTo : '');
  if (challenge && !resolved) {
    throw new Error('An explicit tip challenge needs a creator recipient or a resolvable contentUrl; it cannot fall back to a hold.');
  }
  if (!resolved) {
    // External / unclaimed creator: hold the tip in the domain's no-key box.
    return holdTipContent({ contentUrl, title, amount, currency, network: net, domain, contentId, websiteId, imageUrl, signer, hubApi: api });
  }

  let chal = challenge;
  if (!chal) {
    if (!api) throw new Error('tipContent needs a challenge or hubApi.');
    // A signer that can only do plain transfers needs a transfer-rail
    // challenge (decimal amounts); a gateway challenge quotes base units.
    const paymentRail = signer?.signTypedData ? undefined : 'transfer';
    const res = await fetch(`${api}/hub/tips/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentUrl, title, amount, currency, recipient: resolved, paymentRail }),
    });
    if (!res.ok) throw new Error(`tip challenge failed: ${res.status}`);
    chal = await res.json();
  }
  const paid = await payChallenge({ chal, signer, network: net });
  const { txHash, paymentSignature, paymentRail, payNetwork } = paid;

  // 3. Proof back to whoever issued the challenge. The hub resolves the
  // fee-wallet payee itself, so send the CREATOR recipient (not the payee).
  const receipt = {
    type: 'tip', contentUrl, title, amount: Number(paid.payAmount), currency,
    network: payNetwork, txHash, paymentId: txHash, held: false,
    contentId: contentId || undefined, websiteId: websiteId || undefined, imageUrl: imageUrl || undefined,
  };
  if (api) {
    let verified;
    try {
      const res = await fetch(`${api}/hub/tips/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(paymentSignature && paymentRail !== 'transfer' ? { 'payment-signature': paymentSignature } : {}) },
        body: JSON.stringify({
          ...receipt,
          domain: domain || undefined,
          recipient: resolved || '',
          paymentRail,
          walletAddress: signer?.address || '',
          paymentSignature,
        }),
      });
      verified = await res.json();
      if (!res.ok || verified?.success !== true || verified?.ok === false) {
        throw new Error(verified?.error || `HTTP ${res.status}`);
      }
    } catch (cause) {
      const error = new Error(`Tip verification failed after payment; do not pay again automatically${txHash ? ` (tx ${txHash})` : ''}: ${cause.message}`);
      Object.assign(error, { cause, txHash, paymentSignature, paymentRail });
      throw error;
    }
    return { ...receipt, ...verified.receipt, held: false, status: 'settled', id: verified.id, paymentSignature };
  }
  // A submitted transaction or signed Gateway proof is not settlement evidence.
  return { ...receipt, paymentSignature, status: 'pending' };
}

// Unresolved/external creator: fund the domain's deterministic no-key holding
// box. The creator claims later; the payer can refund until then.
export async function holdTipContent({ contentUrl, title, amount, currency = 'USDC', network, domain, contentId, websiteId, imageUrl, signer, hubApi }) {
  const api = normalizeApi(hubApi);
  const net = network || 'eip155:5042002';
  if (!api) throw new Error('holdTipContent needs hubApi.');
  if (!signer?.signTypedData && !signer?.sendTransaction) throw new Error('holdTipContent needs a signer with signTypedData or sendTransaction.');
  let dom = String(domain || '').trim();
  if (!dom) { try { dom = new URL(contentUrl).hostname; } catch { dom = ''; } }
  if (!dom) throw new Error('holdTipContent needs a domain or contentUrl.');

  const base = { contentUrl, title, amount, currency, domain: dom, contentId: contentId || undefined, websiteId: websiteId || undefined, imageUrl: imageUrl || undefined };
  const requestedRail = signer.signTypedData ? 'gateway' : 'transfer';
  const chalRes = await fetch(`${api}/hub/tips/hold`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...base, paymentRail: requestedRail }),
  });
  if (!chalRes.ok) throw new Error(`tip hold challenge failed: ${chalRes.status}`);
  const chal = await chalRes.json();
  if (!chal?.box) throw new Error('tip hold challenge has no box.');
  const box = chal.box;
  // Older transfer-only hubs returned only the box; full challenges carry
  // the authoritative network and amount, including Gateway base units.
  if (!chal.accepts?.length && requestedRail !== 'transfer') {
    throw new Error('Tip hold challenge has no Gateway payment requirement.');
  }
  const paymentChallenge = chal.accepts?.length ? chal : {
    paymentRail: requestedRail,
    accepts: [{ payTo: box, amount, network: net }],
  };
  const accept = paymentChallenge.accepts[0];
  if (String(accept.payTo || accept.recipient || '').toLowerCase() !== String(box).toLowerCase()) {
    throw new Error('Tip hold challenge recipient does not match its box.');
  }
  const paid = await payChallenge({ chal: paymentChallenge, signer, network: net });
  const { txHash, paymentSignature, paymentRail, payAmount, payNetwork } = paid;
  let held;
  try {
    const verifyRes = await fetch(`${api}/hub/tips/hold`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(paymentRail === 'gateway' ? { 'payment-signature': paymentSignature } : {}) },
      body: JSON.stringify({ ...base, amount: payAmount, paymentRail, txHash, paymentSignature, walletAddress: signer.address || '' }),
    });
    held = await verifyRes.json();
    if (!verifyRes.ok || held?.success !== true || held?.ok === false || held?.holdStatus !== 'held') {
      throw new Error(held?.error || `HTTP ${verifyRes.status}`);
    }
  } catch (cause) {
    const error = new Error(`Tip hold verification failed after payment; do not pay again automatically${txHash ? ` (tx ${txHash})` : ''}: ${cause.message}`);
    Object.assign(error, { cause, txHash, paymentSignature, paymentRail });
    throw error;
  }
  return {
    type: 'tip', held: true, status: 'held', contentUrl, title,
    amount: Number(payAmount), currency, network: payNetwork, domain: dom, box,
    txHash: held?.tip?.txHash || txHash, paymentSignature, receipt: held?.tip || null,
  };
}

function canonicalRefundDomain(domain) {
  const raw = String(domain || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

function refundNonce() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Payer refund for unclaimed held tips. The short-lived signature binds the
// exact domain, payer, amount, and one-time nonce; the hub persists its digest
// before relaying so a captured signature cannot trigger a second refund.
export async function refundTip({ domain, payer, signer, hubApi, network, amount, message }) {
  const api = normalizeApi(hubApi);
  if (!api) throw new Error('refundTip needs hubApi.');
  const from = payer || signer?.address || '';
  if (!from) throw new Error('refundTip needs a payer address.');
  if (!signer?.signMessage) throw new Error('refundTip needs a signer with signMessage.');
  const canon = canonicalRefundDomain(domain);
  if (!canon) throw new Error('refundTip needs a valid domain.');
  let refundAmount = Number(amount);
  if (!(refundAmount > 0)) {
    const heldRes = await fetch(`${api}/hub/tips/held?domain=${encodeURIComponent(canon)}&limit=100`);
    const held = await heldRes.json().catch(() => ({}));
    if (!heldRes.ok) throw new Error(held?.error || `held tip lookup failed: ${heldRes.status}`);
    refundAmount = (Array.isArray(held?.tips) ? held.tips : [])
      .filter((tip) => String(tip?.payerWallet || '').toLowerCase() === String(from).toLowerCase())
      .reduce((sum, tip) => sum + (Number(tip?.amount) || 0), 0);
  }
  if (!(refundAmount > 0)) throw new Error('No unclaimed held tips for this payer/domain.');
  const amountUnits = Math.round(refundAmount * 1e6);
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const networkName = String(network || (api.includes('testnet') ? 'testnet' : 'mainnet')).toLowerCase();
  if (!['mainnet', 'testnet'].includes(networkName)) throw new Error('refundTip needs network mainnet or testnet.');
  const note = message || [
    'Nibgate tip refund', `network:${networkName}`, `domain:${canon}`,
    `wallet:${String(from).toLowerCase()}`, `amount:${amountUnits}`,
    `expires:${expiresAt}`, `nonce:${refundNonce()}`,
  ].join('\n');
  const signature = await signer.signMessage(note);
  const res = await fetch(`${api}/hub/tips/refund`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain: canon, payer: from, amount: amountUnits / 1e6, message: note, signature }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.error || `refund failed: ${res.status}`);
  return body;
}
