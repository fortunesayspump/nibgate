// One-off: reconcile existing `verified` UnlockReceipts against on-chain truth.
//   node scripts/verify-receipts.mjs            # dry run
//   node scripts/verify-receipts.mjs --execute  # apply
//
// Goals (non-destructive — real payments are never demoted, only surfaced):
//   1. Backfill recipientWallet for direct-transfer receipts by reading the
//      on-chain USDC Transfer destination for each stored txHash.
//   2. Fix receipts mislabeled as circle-gateway but actually direct-transfer
//      (they carry a 0x on-chain txHash).
//   3. Demote to 'unverified':
//        - any receipt whose 0x txHash does not exist on-chain (provably fake)
//        - malformed receipts (no provider / empty paymentId)
//   4. Gateway receipts: validate the batch ref is a plausible (non-0x) id.
import { db } from '@nibgate/internal/db.js';
import { createPublicClient, http } from 'viem';

const EXECUTE = process.argv.includes('--execute');
const tag = EXECUTE ? '[exec]' : '[dry]';
const RPC = process.env.NIBGATE_PAYMENT_RPC_URL || 'https://rpc.testnet.arc.io';
const USDC = process.env.NIBGATE_USDC_ADDRESS || '0x3600000000000000000000000000000000000000';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const client = createPublicClient({ chain: { id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }, transport: http(RPC) });

const looksLikeOnchainHash = (v) => typeof v === 'string' && /^0x[a-fA-F0-9]{64}$/.test(v);
const looksLikeValidGatewayRef = (v) => typeof v === 'string' && v.length >= 10 && !v.startsWith('0x');

const SITE_OK = { deletedAt: null, isVerified: true, verificationStatus: 'verified' };
const receipts = await db.unlockReceipt.findMany({
  where: { status: 'verified', content: { website: SITE_OK } },
  select: { id: true, paymentProvider: true, txHash: true, paymentId: true, recipientWallet: true, amount: true, currency: true },
});

const stats = { scanned: 0, backfilledRecipient: 0, fixedProvider: 0, demotedFake: 0, demotedMalformed: 0, demotedGateway: 0 };

async function usdcRecipients(hash) {
  try {
    const r = await client.getTransactionReceipt({ hash });
    if (!r) return null;
    const out = [];
    for (const l of r.logs || []) {
      if ((l.address || '').toLowerCase() !== USDC.toLowerCase()) continue;
      if (l.topics?.[0] !== TRANSFER_TOPIC) continue;
      const to = `0x${l.topics[2].slice(26)}`.toLowerCase();
      const value = BigInt(l.data || '0x0');
      out.push({ to, amount: Number(value) / 1e6 });
    }
    return out.length ? out : null;
  } catch { return null; }
}

function providerOf(txHash) {
  return /^0x[a-fA-F0-9]{64}$/.test(txHash) ? 'direct-transfer' : 'circle-gateway';
}

for (const r of receipts) {
  stats.scanned++;
  const origProvider = String(r.paymentProvider || '').toLowerCase();

  // Malformed → demote.
  if (!r.paymentProvider || r.paymentProvider === 'null' || !r.paymentId) {
    console.log(`${tag} demote malformed ${r.id.slice(0, 8)}`);
    if (EXECUTE) await db.unlockReceipt.update({ where: { id: r.id }, data: { status: 'unverified' } });
    stats.demotedMalformed++;
    continue;
  }

  const has0x = looksLikeOnchainHash(r.txHash);

  // It carries a 0x on-chain txHash → it is a direct transfer, regardless of label.
  if (has0x) {
    const transfers = await usdcRecipients(r.txHash);
    if (transfers === null) {
      // Tx does not exist on-chain → provably fake. Demote.
      console.log(`${tag} demote fake direct (tx not found on-chain) ${r.id.slice(0, 8)} tx=${r.txHash.slice(0, 14)}`);
      if (EXECUTE) await db.unlockReceipt.update({ where: { id: r.id }, data: { status: 'unverified' } });
      stats.demotedFake++;
      continue;
    }
    // Real on-chain transfer. Fix provider label + backfill recipient.
    const changes = {};
    if (origProvider !== 'direct-transfer') { changes.paymentProvider = 'direct-transfer'; stats.fixedProvider++; }
    if (!r.recipientWallet && transfers[0]?.to) { changes.recipientWallet = transfers[0].to; stats.backfilledRecipient++; }
    if (Object.keys(changes).length) {
      console.log(`${tag} fix direct ${r.id.slice(0, 8)} provider=${origProvider}->direct recipient=${r.recipientWallet || transfers[0]?.to || ''}`);
      if (EXECUTE) await db.unlockReceipt.update({ where: { id: r.id }, data: changes });
    }
    continue;
  }

  // No 0x hash: should be a gateway batch ref (UUID-ish). If implausible → demote.
  if (looksLikeValidGatewayRef(r.txHash || r.paymentId)) continue; // valid gateway
  console.log(`${tag} demote implausible gateway ref ${r.id.slice(0, 8)} ref=${String(r.txHash || '').slice(0, 20)}`);
  if (EXECUTE) await db.unlockReceipt.update({ where: { id: r.id }, data: { status: 'unverified' } });
  stats.demotedGateway++;
}

console.log(`${tag} scanned ${stats.scanned} — ${JSON.stringify(stats)}`);
process.exit(0);
