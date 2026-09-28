import { createCircleGatewayBrowserAdapter } from './gateway.js';

// Browser tip flow: challenge → pay → proof. No access grant — the receipt
// IS the product. Works standalone (explicit recipient) or against the hub
// tip endpoints. Testnet by default; pass network/chainId for mainnet.
//
// Two rails depending on whether the creator resolves on Nibgate:
//   resolved   → direct tip (USDC straight to the payee), status settled
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
    if (!res.ok) return '';
    const data = await res.json();
    return data?.wallet || '';
  } catch {
    return '';
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
  if (signer?.signTypedData) {
    const adapter = await createCircleGatewayBrowserAdapter({ network: payNetwork, signer });
    const paid = await adapter.pay(chal, { address: signer.address });
    txHash = paid?.transaction || paid?.txHash || '';
    paymentSignature = paid?.signature || txHash;
    paymentRail = paymentRail || (paymentSignature && paymentSignature !== txHash ? 'gateway' : 'transfer');
  } else if (signer?.sendTransaction) {
    txHash = await signer.sendTransaction({ to: payTo, amount: payAmount, network: payNetwork });
    paymentSignature = txHash;
    paymentRail = 'transfer';
  } else {
    throw new Error('tipContent needs a signer (signTypedData or sendTransaction).');
  }
  return { txHash, paymentSignature, paymentRail, payTo, payAmount, payNetwork };
}

export async function tipContent({ contentUrl, title, amount, currency = 'USDC', network, recipient, challenge, signer, hubApi, domain }) {
  const api = normalizeApi(hubApi);
  const net = network || 'eip155:5042002';

  if (!challenge && !signer) throw new Error('tipContent needs a signer.');

  // Attempt to resolve the creator when the caller did not pin a recipient.
  const resolved = challenge ? recipient : await resolveRecipient({ api, contentUrl, recipient });
  if (!resolved) {
    // External / unclaimed creator: hold the tip in the domain's no-key box.
    return holdTipContent({ contentUrl, title, amount, currency, network: net, domain, signer, hubApi: api });
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
  };
  if (api) {
    await fetch(`${api}/hub/tips/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(paymentSignature && paymentRail !== 'transfer' ? { 'payment-signature': paymentSignature } : {}) },
      body: JSON.stringify({
        ...receipt,
        recipient: resolved || '',
        paymentRail,
        walletAddress: signer?.address || '',
        paymentSignature,
      }),
    }).catch(() => {});
  }
  return { ...receipt, paymentSignature };
}

// Unresolved/external creator: fund the domain's deterministic no-key holding
// box. The creator claims later; the payer can refund until then.
export async function holdTipContent({ contentUrl, title, amount, currency = 'USDC', network, domain, signer, hubApi }) {
  const api = normalizeApi(hubApi);
  const net = network || 'eip155:5042002';
  if (!api) throw new Error('holdTipContent needs hubApi.');
  if (!signer) throw new Error('holdTipContent needs a signer.');
  let dom = String(domain || '').trim();
  if (!dom) { try { dom = new URL(contentUrl).hostname; } catch { dom = ''; } }
  if (!dom) throw new Error('holdTipContent needs a domain or contentUrl.');

  const base = { contentUrl, title, amount, currency, domain: dom };
  const chalRes = await fetch(`${api}/hub/tips/hold`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...base, paymentRail: 'transfer' }),
  });
  if (!chalRes.ok) throw new Error(`tip hold challenge failed: ${chalRes.status}`);
  const chal = await chalRes.json();
  if (!chal?.box) throw new Error('tip hold challenge has no box.');
  const box = chal.box;
  const payAmount = amount;

  const txHash = await signer.sendTransaction({ to: box, amount: payAmount, network: net });
  const verifyRes = await fetch(`${api}/hub/tips/hold`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...base, paymentRail: 'transfer', txHash, walletAddress: signer.address || '' }),
  });
  if (!verifyRes.ok) throw new Error(`tip hold failed: ${verifyRes.status} (tx ${txHash || ''})`);
  const held = await verifyRes.json();
  return {
    type: 'tip', held: true, status: 'held', contentUrl, title,
    amount: Number(payAmount), currency, network: net, domain: dom, box, txHash, receipt: held?.tip || null,
  };
}

// Payer refund for unclaimed held tips. Signs a control message (proves wallet
// ownership; funds can only ever return to the payer) and asks the hub to
// relay the on-chain refund. Full amount, no fee.
export async function refundTip({ domain, payer, signer, hubApi, amount, message }) {
  const api = normalizeApi(hubApi);
  if (!api) throw new Error('refundTip needs hubApi.');
  const from = payer || signer?.address || '';
  if (!from) throw new Error('refundTip needs a payer address.');
  if (!signer?.signMessage) throw new Error('refundTip needs a signer with signMessage.');
  const note = message || `Nibgate tip refund\nDomain: ${domain}\nWallet: ${String(from).toLowerCase()}\nIssued: ${new Date().toISOString()}`;
  const signature = await signer.signMessage(note);
  const res = await fetch(`${api}/hub/tips/refund`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain, payer: from, amount, message: note, signature }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.error || `refund failed: ${res.status}`);
  return body;
}
