import { db } from '@nibgate/internal/db.js';

const direct = await db.unlockReceipt.findMany({
  where: { status: 'verified', paymentProvider: 'direct-transfer', content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } },
  select: { id: true, txHash: true, payerWallet: true, recipientWallet: true, amount: true, createdAt: true, content: { select: { title: true, url: true } } },
  orderBy: { createdAt: 'desc' },
});

console.log('total direct receipts:', direct.length);
// check tx existence for a sample
function last10(h){return h && h.length>=10 ? h.slice(0,10) : h;}
for (const r of direct.slice(0, 62)) {
  console.log(`${r.id.slice(0,8)} tx=${last10(r.txHash)} payer=${(r.payerWallet||'').slice(0,10)} recipient=${(r.recipientWallet||'').slice(0,10)} amt=${r.amount} ${(r.content?.title||'').slice(0,28)}`);
}
process.exit(0);
