// Magic's embedded-wallet CSP allows Reown's RPC host but currently blocks
// Arc's direct RPC hosts. Use Reown's supported Arc routes for AppKit while
// keeping the public chain definitions and application read transports intact.
export function arcAppKitRpcUrls(chains, projectId) {
  return Object.fromEntries(chains
    .filter(({ id }) => id === 5042 || id === 5042002)
    .map(({ id }) => {
      const chainId = `eip155:${id}`
      const url = new URL('https://rpc.walletconnect.org/v1/')
      url.searchParams.set('chainId', chainId)
      url.searchParams.set('projectId', projectId)
      return [chainId, [{ url: url.toString() }]]
    }))
}

// Reown's embedded W3mFrameProvider reads rpcUrls.default.http[0] from the
// active CaipNetwork. customRpcUrls alone is used by other AppKit paths and
// does not replace this value; leaving the original Arc host here makes
// Google wallets call a URL their CSP blocks.
export function arcAppKitNetworks(chains, projectId) {
  const routes = arcAppKitRpcUrls(chains, projectId)
  return chains.map(chain => {
    const route = routes[`eip155:${chain.id}`]?.[0]?.url
    if (!route) return chain
    return {
      ...chain,
      rpcUrls: {
        ...chain.rpcUrls,
        default: { ...chain.rpcUrls.default, http: [route] },
      },
    }
  })
}
