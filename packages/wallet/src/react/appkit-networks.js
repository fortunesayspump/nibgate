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
