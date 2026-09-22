export function defaultConfig() {
  // Scaffolding for `nibgate init` (localhost-first). Chain endpoints follow
  // NIBGATE_NETWORK when set, defaulting to testnet.
  const mainnet = String(process.env.NIBGATE_NETWORK || '').toLowerCase() === 'mainnet';
  const caip2 = mainnet ? 'eip155:5042' : 'eip155:5042002';
  const facilitator = mainnet ? 'https://gateway-api.circle.com' : 'https://gateway-api-testnet.circle.com';
  const netTag = mainnet ? 'arc' : 'arc-testnet';
  return {
    site: {
      name: 'My Nibgate Site',
      origin: 'http://localhost:3000',
      creatorWallet: `${netTag}:replace_me`,
      platformFeeBps: 100
    },
    payments: {
      mode: 'demo',
      sellerAddress: '',
      facilitatorUrl: process.env.NIBGATE_FACILITATOR_URL || facilitator,
      networks: [process.env.NIBGATE_PAYMENT_NETWORK || caip2]
    },
    hub: {
      apiBaseUrl: process.env.NIBGATE_HUB_URL || 'http://localhost:3000',
      siteId: '',
      siteToken: '',
      verifyToken: '',
      publicSiteUrl: 'http://localhost:3000',
      lastSyncAt: '',
      lastEventAt: ''
    },
    routes: [
      {
        id: 'premium-article',
        path: '/premium/article',
        title: 'Premium Article',
        type: 'article',
        price: '0.005',
        agentPrice: '0.001',
        currency: 'USDC',
        network: netTag,
        license: 'Paid read access with citation allowed after unlock.',
        splits: [
          {
            label: 'Creator',
            wallet: `${netTag}:replace_me`,
            bps: 9400
          }
        ]
      }
    ]
  };
}
