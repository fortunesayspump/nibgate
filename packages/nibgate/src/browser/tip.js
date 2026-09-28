import { createCircleGatewayBrowserAdapter } from './gateway.js';

// Browser tip flow: challenge → pay → proof. No access grant — the receipt
// IS the product. Works standalone (explicit recipient) or against the hub
// tip endpoints. Testnet by default; pass network/chainId for mainnet.

export async function tipContent({ contentUrl, title, amount, currency = 'USDC', network, recipient, challenge, signer, hubApi }) {
  const api = (hubApi || '').replace(/\/+$/, '');
  const net = network || 'eip155:5042002';

  // 1. Challenge (passed in or fetched).
  let chal = challenge;
  if (!chal) {
    if (!api) throw new Error('tipContent needs a challenge or hubApi.');
    if (!recipient && !contentUrl) throw new Error('tipContent needs a recipient or contentUrl.');
    const res = await fetch(`${api}/hub/tips/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentUrl, title, amount, currency, recipient }),
    });
    if (!res.ok) throw new Error(`tip challenge failed: ${res.status}`);
    chal = await res.json();
  }
  const accept = chal.accepts?.[0] || {};
  const payTo = accept.payTo || accept.recipient || recipient || '';
  const payAmount = accept.amount || amount;
  const payNetwork = accept.network || net;
  if (!payTo) throw new Error('tip challenge has no recipient.');
  if (!(Number(payAmount) > 0)) throw new Error('tip challenge has no amount.');

  // 2. Pay: Gateway adapter when available, else plain USDC transfer.
  let txHash = '';
  let paymentSignature = '';
  if (signer?.signTypedData) {
    const adapter = await createCircleGatewayBrowserAdapter({ network: payNetwork, signer });
    const paid = await adapter.pay(chal, { address: signer.address });
    txHash = paid?.transaction || paid?.txHash || '';
    paymentSignature = paid?.signature || txHash;
  } else if (signer?.sendTransaction) {
    txHash = await signer.sendTransaction({ to: payTo, amount: payAmount, network: payNetwork });
    paymentSignature = txHash;
  } else {
    throw new Error('tipContent needs a signer (signTypedData or sendTransaction).');
  }

  // 3. Proof back to whoever issued the challenge. The hub resolves the
  // fee-wallet payee itself, so send the CREATOR recipient (not the payee).
  const paymentRail = chal.paymentRail || (paymentSignature && paymentSignature !== txHash ? 'gateway' : 'transfer');
  const receipt = {
    type: 'tip', contentUrl, title, amount: Number(payAmount), currency,
    network: payNetwork, txHash, paymentId: txHash,
  };
  if (api) {
    await fetch(`${api}/hub/tips/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(paymentSignature && paymentRail !== 'transfer' ? { 'payment-signature': paymentSignature } : {}) },
      body: JSON.stringify({
        ...receipt,
        recipient: recipient || '',
        paymentRail,
        walletAddress: signer?.address || '',
        paymentSignature,
      }),
    }).catch(() => {});
  }
  return { ...receipt, paymentSignature };
}
