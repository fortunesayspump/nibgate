import { db } from '@nibgate/internal/db.js';

function primaryWalletOf(owner) {
  const wallets = owner?.wallets || [];
  const primary = wallets.find((w) => w.isPrimary) || wallets[0];
  return primary?.walletAddress || '';
}

// In production the api backend boots from environment config with no static
// `routes` list (NIBGATE_CONFIG unset), which left the generic /api/content/:id/*
// gateway (price/access/unlock) permanently empty. Backfill the route table from
// live verified content so real content ids resolve. Only used when the static
// config ships no routes (i.e. the deployed api backend).
export async function liveRoutesFromContent({ max = 500 } = {}) {
  const content = await db.content.findMany({
    where: {
      deletedAt: null,
      website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' }
    },
    include: {
      website: { include: { owner: { include: { wallets: true } } } },
      publisher: true
    },
    orderBy: { createdAt: 'desc' },
    take: max
  });

  return content.map((c) => ({
    id: c.id,
    path: c.path || '',
    originUrl: c.url || '',
    title: c.title,
    type: c.contentType,
    price: String(c.price || '0'),
    agentPrice: String(c.price || '0'),
    currency: c.currency || 'USDC',
    network: 'eip155:5042002',
    license: '',
    splits: [],
    // Per-content recipient (set at publish / admin): the creator's wallet, not
    // a platform env var. Same model as shares (share.ownerWallet).
    recipientWallet: c.recipientWallet || c.publisher?.walletAddress || c.publisherWallet || primaryWalletOf(c.website?.owner) || ''
  }));
}