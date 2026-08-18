import { createRequire } from 'module';
import { runHostedPayRequirement } from '/Users/fortune/Documents/Workflows/nibgate-repo/packages/nibgate/src/server/fee-wallet.js';
import { GatewayClient } from '/Users/fortune/Documents/Workflows/nibgate-repo/backend/node_modules/@circle-fin/x402-batching/dist/client/index.js';
const require = createRequire(import.meta.url);
const wallet = JSON.parse(require('fs').readFileSync('/Users/fortune/Documents/Workflows/nibgate-repo/swarm/wallets/67-FlodFlip.json', 'utf8'));

(async () => {
  const client = new GatewayClient({ chain: 'arcTestnet', privateKey: wallet.privateKey, rpcUrl: 'https://rpc.testnet.arc.network' });
  const url = 'https://analog.nibgate.xyz/api/nibgate/access?path=/writing/analog-35mm-vs-medium-format-what-is-the-difference';
  const r1 = await fetch(url, { headers: { 'x-site-subdomain': 'analog' } });
  const req = JSON.parse(Buffer.from(r1.headers.get('PAYMENT-REQUIRED'), 'base64').toString('utf-8'));
  const opt = req.accepts[0];
  const payload = await client.batchScheme.createPaymentPayload(2, opt);
  const full = { x402Version: 2, resource: req.resource, accepted: opt, payload: payload.payload };
  const header = Buffer.from(JSON.stringify(full)).toString('base64');

  const requestHeaders = { 'content-type': 'application/json', 'payment-signature': header, 'x-site-subdomain': 'analog' };
  const gateway = await runHostedPayRequirement(
    { method: 'POST', url: '/writing/analog-35mm-vs-medium-format-what-is-the-difference', headers: requestHeaders },
    { id: 'c', title: 't', price: '0.5', recipient: '0xC234D8279D6b8a149625D92c38DDAfD5e01cA3D2', path: '/p', paymentRail: 'gateway' },
    { hosted: true },
  );
  if (gateway.handled) {
    console.log('HANDLED status:', gateway.response.status, 'body:', (await gateway.response.text()).slice(0,300));
  } else {
    console.log('SUCCESS payment:', JSON.stringify(gateway.payment).slice(0,400));
  }
})().catch(e => console.error('ERR:', e.message));
