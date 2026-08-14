import { db } from '@nibgate/internal/db.js';

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
    include: { website: true },
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
    splits: []
  }));
}