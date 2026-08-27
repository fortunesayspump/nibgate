import { db } from '@nibgate/internal/db.js';
import { createTransferVerifier } from '@nibgate/sdk/server';

const sample = await db.unlockReceipt.findMany({
  where: { status: 'verified', content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } },
  select: { id: true, paymentProvider: true, paymentId: true, txHash: true, recipientWallet: true, payerWallet: true, amount: true, currency: true, createdAt: true, content: { select: { title: true, recipientWallet: true, price: true, url: true } } },
  orderBy: { createdAt: 'desc' },
  take: 25,
});

for (const r of sample) {
  console.log(JSON.stringify({
    id: r.id.slice(0, 8),
    provider: r.paymentProvider,
    txHash: (r.txHash || '').slice(0, 18),
    paymentId: (r.paymentId || '').slice(0, 18),
    recipientWallet: (r.recipientWallet || '').slice(0, 10),
    contentRecipient: (r.content?.recipientWallet || '').slice(0, 10),
    amount: r.amount,
    created: r.createdAt ? r.createdAt.toISOString().slice(0, 16) : null,
    title: (r.content?.title || '').slice(0, 30),
    price: r.content?.price,
  }));
}
process.exit(0);
