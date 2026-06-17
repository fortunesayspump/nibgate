export function defaultConfig() {
  return {
    site: {
      name: 'My Nibgate Site',
      origin: 'http://localhost:3000',
      creatorWallet: 'arc_testnet:replace_me',
      platformFeeBps: 600
    },
    payments: {
      mode: 'demo',
      sellerAddress: '',
      facilitatorUrl: 'https://gateway-api-testnet.circle.com',
      networks: ['eip155:5042002']
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
        network: 'arc-testnet',
        license: 'Paid read access with citation allowed after unlock.',
        splits: [
          {
            label: 'Creator',
            wallet: 'arc_testnet:replace_me',
            bps: 9400
          }
        ]
      }
    ]
  };
}
