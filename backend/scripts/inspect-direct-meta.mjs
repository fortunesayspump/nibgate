import { db } from '@nibgate/internal/db.js';
const direct = await db.unlockReceipt.findMany({
  where: { status: 'verified', paymentProvider: 'direct-transfer', content: { website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' } } },
  select: { id: true, txHash: true, payerWallet: true, recipientWallet: true, amount: true, metadata: true, createdAt: true, content: { select: { title: true, url: true, recipientWallet: true } } },
  orderBy: { createdAt: 'desc' },
});
console.log('total:', direct.length, '| with recipientWallet:', direct.filter(r=>r.recipientWallet).length, '| content.recipientWallet set:', direct.filter(r=>r.content?.recipientWallet).length);
const sample = direct[0];
console.log('--- sample metadata ---');
console.log('txHash:', sample.txHash);
console.log('payerWallet:', sample.payerWallet);
console.log('recipientWallet:', sample.recipientWallet || '(EMPTY)');
console.log('content.recipientWallet:', sample.content?.recipientWallet || '(EMPTY)');
console.log('content.url:', sample.content?.url);
console.log('metadata:', (sample.metadata||'').slice(0,600));
process.exit(0);
