import test from 'node:test'
import assert from 'node:assert/strict'
import { arcAppKitNetworks } from '../src/react/appkit-networks.js'
import { arcMainnet, arcTestnet } from '../src/chain.js'

test('embedded Arc wallet receives a CSP-compatible RPC while public chain metadata stays canonical', () => {
  const configured = arcAppKitNetworks([arcTestnet, arcMainnet], 'qa-project')
  assert.equal(configured[0].rpcUrls.default.http[0], 'https://rpc.walletconnect.org/v1/?chainId=eip155%3A5042002&projectId=qa-project')
  assert.equal(configured[1].rpcUrls.default.http[0], 'https://rpc.walletconnect.org/v1/?chainId=eip155%3A5042&projectId=qa-project')
  assert.equal(arcTestnet.rpcUrls.default.http[0], 'https://rpc.testnet.arc.io')
  assert.equal(arcMainnet.rpcUrls.default.http[0], 'https://rpc.mainnet.arc.io')
})
