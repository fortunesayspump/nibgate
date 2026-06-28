'use client'

import { useAppKit, useAppKitAccount, useDisconnect as useAppKitDisconnect } from '@reown/appkit/react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAccount, useBalance, useChainId, useDisconnect } from 'wagmi'
import { arcTestnet } from '../lib/wagmi'
import { getConnectedChainId, isArcTestnetChainId } from '../lib/chains'
import { createPublicClient, http } from 'viem'

declare global {
  interface Window { nibgateWalletAddress?: string; nibgateAuthenticated?: boolean }
}

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isHexAddress(address?: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address ?? '')
}

const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const GATEWAY_ABI = [{ name: 'availableBalance', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'depositor', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }] as const

const gatewayClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
})

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n)
}

export function WalletButton() {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, chainId, isConnected } = useAccount()
  const activeChainId = useChainId()
  const { disconnect } = useDisconnect()
  const { disconnect: disconnectAppKit } = useAppKitDisconnect()
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isWalletConnected && !isArcTestnetChainId(connectedChainId)

  const { data: nativeBalance } = useBalance({
    address: displayAddress,
    chainId: arcTestnet.id,
  })

  const [selectedToken, setSelectedToken] = useState<'native' | 'gateway'>('native')
  const [gatewayBalance, setGatewayBalance] = useState(0)

  const nativeNum = nativeBalance ? Number(nativeBalance.value) / 10 ** nativeBalance.decimals : 0
  const nativeDisplay = fmt(nativeNum) + ' USDC'
  const gatewayDisplay = fmt(gatewayBalance) + ' USDC'
  const displayBalance = selectedToken === 'native' ? nativeDisplay : gatewayDisplay

  useEffect(() => {
    if (!isWalletConnected || !displayAddress || isWrongChain) return
    gatewayClient.readContract({
      address: GATEWAY_WALLET_ADDRESS, abi: GATEWAY_ABI, functionName: 'availableBalance',
      args: [USDC_ADDRESS, displayAddress],
    }).then(raw => {
      setGatewayBalance(Number(raw) / 1_000_000)
    }).catch(() => {
      setGatewayBalance(0)
    })
  }, [isWalletConnected, displayAddress, isWrongChain])

  useEffect(() => {
    if (isWalletConnected && displayAddress) {
      window.nibgateWalletAddress = displayAddress
    }
  }, [isWalletConnected, displayAddress])

  useEffect(() => {
    document.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button, a')
      if (!t) return

      if (t.hasAttribute('data-wallet-connect')) {
        e.preventDefault()
        if (t.getAttribute('data-connected') !== 'true') {
          sessionStorage.setItem('nibgate-wants-redirect', 'true')
          open()
        }
      } else if (t.hasAttribute('data-wallet-disconnect')) {
        e.preventDefault()
        try { fetch('/api/auth/logout', { method: 'POST' }) } catch {}
        window.nibgateAuthenticated = false
        disconnect()
        void disconnectAppKit({ namespace: 'eip155' })
      } else if (t.hasAttribute('data-token-select')) {
        e.preventDefault()
        const token = t.getAttribute('data-token-select') || 'native'
        setSelectedToken(token as 'native' | 'gateway')
      }
    })
  }, [open, disconnect, disconnectAppKit])

  if (isWrongChain) {
    return null
  }

  return (
    <>
      <div className="nibgate-wallet-container" data-balance-container>
        <button type="button" className="nibgate-header-login" data-balance-text data-selected-token={selectedToken} data-native={nativeDisplay} data-gateway={gatewayDisplay} style={{ display: isWalletConnected ? 'flex' : 'none' }}>
          {displayBalance}
        </button>
        <div className="nibgate-wallet-dropdown" data-balance-dropdown style={{ display: 'none' }}>
          <button type="button" className="dropdown-item" data-token-select="native" style={{ fontWeight: 500, color: selectedToken === 'native' ? 'var(--nib-teal)' : '' }}>{arcTestnet.nativeCurrency.symbol}</button>
          <button type="button" className="dropdown-item" data-token-select="gateway" style={{ fontWeight: 500, color: selectedToken === 'gateway' ? 'var(--nib-teal)' : '' }}>Gateway</button>
        </div>
      </div>

      <div className="nibgate-wallet-container" data-wallet-container>
        <button className="nibgate-header-cta" type="button" data-wallet-connect data-connected={isWalletConnected && displayAddress ? 'true' : 'false'} data-address={displayAddress || ''} style={{ display: 'flex' }}>
          {isWalletConnected && displayAddress ? shortAddress(displayAddress) : 'Connect wallet'}
        </button>
        {isWalletConnected && displayAddress ? (
          <div className="nibgate-wallet-dropdown" data-wallet-dropdown style={{ display: 'none' }}>
            <Link href="/dashboard" className="dropdown-item">Dashboard</Link>
            <button type="button" className="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
          </div>
        ) : null}
      </div>
    </>
  )
}

export function WalletButtonMobile() {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, chainId, isConnected } = useAccount()
  const activeChainId = useChainId()
  const { disconnect } = useDisconnect()
  const { disconnect: disconnectAppKit } = useAppKitDisconnect()
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isWalletConnected && !isArcTestnetChainId(connectedChainId)

  const { data: nativeBalance } = useBalance({
    address: displayAddress,
    chainId: arcTestnet.id,
  })

  const [selectedToken, setSelectedToken] = useState<'native' | 'gateway'>('native')
  const [gatewayBalance, setGatewayBalance] = useState(0)

  const nativeNum = nativeBalance ? Number(nativeBalance.value) / 10 ** nativeBalance.decimals : 0
  const nativeDisplay = fmt(nativeNum) + ' USDC'
  const gatewayDisplay = fmt(gatewayBalance) + ' USDC'
  const displayBalance = selectedToken === 'native' ? nativeDisplay : gatewayDisplay

  useEffect(() => {
    if (!isWalletConnected || !displayAddress || isWrongChain) return
    gatewayClient.readContract({
      address: GATEWAY_WALLET_ADDRESS, abi: GATEWAY_ABI, functionName: 'availableBalance',
      args: [USDC_ADDRESS, displayAddress],
    }).then(raw => {
      setGatewayBalance(Number(raw) / 1_000_000)
    }).catch(() => {
      setGatewayBalance(0)
    })
  }, [isWalletConnected, displayAddress, isWrongChain])

  useEffect(() => {
    if (isWalletConnected && displayAddress) {
      window.nibgateWalletAddress = displayAddress
    }
  }, [isWalletConnected, displayAddress])

  if (isWrongChain) {
    return null
  }

  return (
    <>
      <div className="nibgate-wallet-container" data-balance-container style={{ width: '100%' }}>
        <button type="button" className="nibgate-header-mobile-login" style={{ width: '100%', display: isWalletConnected ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center' }} data-balance-text data-selected-token={selectedToken} data-native={nativeDisplay} data-gateway={gatewayDisplay}>
          {displayBalance}
        </button>
        <div className="nibgate-wallet-dropdown mobile-dropdown" data-balance-dropdown style={{ display: 'none' }}>
          <button type="button" className="dropdown-item" data-token-select="native" style={{ fontWeight: 500, color: selectedToken === 'native' ? 'var(--nib-teal)' : '' }}>{arcTestnet.nativeCurrency.symbol}</button>
          <button type="button" className="dropdown-item" data-token-select="gateway" style={{ fontWeight: 500, color: selectedToken === 'gateway' ? 'var(--nib-teal)' : '' }}>Gateway</button>
        </div>
      </div>

      <div className="nibgate-wallet-container" data-wallet-container style={{ width: '100%' }}>
        <button className="nibgate-header-mobile-cta" type="button" data-wallet-connect data-connected={isWalletConnected && displayAddress ? 'true' : 'false'} data-address={displayAddress || ''} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isWalletConnected && displayAddress ? shortAddress(displayAddress) : 'Connect wallet'}
        </button>
        {isWalletConnected && displayAddress ? (
          <div className="nibgate-wallet-dropdown mobile-dropdown" data-wallet-dropdown style={{ display: 'none' }}>
            <Link href="/dashboard" className="dropdown-item">Dashboard</Link>
            <button type="button" className="dropdown-item dropdown-disconnect" data-wallet-disconnect>Disconnect</button>
          </div>
        ) : null}
      </div>
    </>
  )
}
