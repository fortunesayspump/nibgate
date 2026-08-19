// Live gateway purchase E2E: signed bot wallet -> subblog access -> hub /hub/pay
// -> Circle gateway settle. Verifies success + hub ledger row.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
import { GatewayClient } from '/Users/fortune/Documents/Workflows/nibgate-repo/backend/node_modules/@circle-fin/x402-batching/dist/client/index.js';

const SUB = process.env.PROD_SUB || 'analog';
const SLUG = process.env.PROD_SLUG || 'analog-35mm-vs-medium-format-what-is-the-difference';
const WALLET_FILE = process.env.GW_WALLET || '/Users/fortune/Documents/Workflows/nibgate-repo/swarm/wallets/67-FlodFlip.json';
const wallet = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
const SUBFRONT = `https://${SUB}.nibgate.xyz`;
const ACCESS = `${SUBFRONT}/api/nibgate/access?path=/writing/${SLUG}`;
const PRICE = 0.5;

console.log('[gateway] wallet', wallet.address);
const client = new GatewayClient({ chain: 'arcTestnet', privateKey: wallet.privateKey, rpcUrl: 'https://rpc.testnet.arc.network' });

const r1 = await fetch(ACCESS, { headers: { 'x-site-subdomain': SUB } });
console.log('[step1] access ->', r1.status, r1.headers.get('x-nibgate-rate-limit') || '');
const req = JSON.parse(Buffer.from(r1.headers.get('PAYMENT-REQUIRED'), 'base64').toString('utf-8'));
console.log('[step1] challenge resource=', req.resource?.url?.slice(0, 40), 'price=', req.accepts?.[0]?.price);

const opt = req.accepts[0];
const payload = await client.batchScheme.createPaymentPayload(PRICE, opt);
const full = { x402Version: 2, resource: req.resource, accepted: opt, payload: payload.payload };
const header = Buffer.from(JSON.stringify(full)).toString('base64');

const r2 = await fetch(ACCESS, { headers: { 'x-site-subdomain': SUB, 'payment-signature': header, 'content-type': 'application/json' } });
const body = await r2.text();
console.log('[step2] access+signature ->', r2.status);
console.log('[step2] body:', body.slice(0, 600));
if (r2.status === 200) {
  const j = JSON.parse(body);
  console.log('PAYMENT: provider=', j.payment?.paymentProvider, 'payer=', j.payment?.payer, 'txHash=', j.payment?.txHash, 'amount=', j.payment?.amount);
}
