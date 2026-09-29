import fs from 'node:fs';
import path from 'node:path';
import { getGatewayBalances, withdrawFromGateway } from '../packages/nibgate/src/server/gateway.js';

const env = fs.readFileSync(path.resolve('backend/.env'), 'utf8');
const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('NIBGATE_KEEPER_PRIVATE_KEY='));
const keeperKey = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');

const j = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const bal = await getGatewayBalances({ buyerPrivateKey: keeperKey });
console.log('gateway balances', j(bal).slice(0, 400));

if (process.argv[2] === 'withdraw') {
  const amount = process.argv[3] || '1';
  const out = await withdrawFromGateway(amount, { buyerPrivateKey: keeperKey, buyerChain: 'arcTestnet' });
  console.log('withdraw', j(out).slice(0, 400));
}
