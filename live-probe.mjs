// Live Arc *testnet* probe (read-only). Derives the keeper address from the
// configured key without ever printing the key, then reads balances.
import { readFileSync } from 'node:fs'
import { privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import { ARC_USDC } from './packages/nibgate/src/server/fee-wallet.js'

const env = Object.fromEntries(
  readFileSync('backend/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

if (env.NIBGATE_NETWORK !== 'testnet') {
  console.error(`REFUSING: NIBGATE_NETWORK=${env.NIBGATE_NETWORK} (need testnet)`)
  process.exit(1)
}

const account = privateKeyToAccount(env.NIBGATE_KEEPER_PRIVATE_KEY)
console.log('keeper address :', account.address)

const client = createPublicClient({ chain: arcTestnet, transport: http(env.ARC_RPC_URL) })
console.log('arc chainId    :', await client.getChainId())

const abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'])
const dec = Number(await client.readContract({ address: ARC_USDC, abi, functionName: 'decimals' }))
const bal = await client.readContract({ address: ARC_USDC, abi, functionName: 'balanceOf', args: [account.address] })

console.log('USDC (sdk)     :', ARC_USDC)
console.log('USDC decimals  :', dec)
console.log('keeper USDC    :', formatUnits(bal, dec))
console.log('keeper native  :', formatUnits(await client.getBalance({ address: account.address }), 18), 'gas units')