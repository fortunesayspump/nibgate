'use client'

import { useAppKit, useAppKitAccount, useDisconnect as useAppKitDisconnect } from '@reown/appkit/react'
import Link from 'next/link'
import { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useBalance } from 'wagmi'
import { arcTestnet } from '../lib/wagmi'

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isHexAddress(address?: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address ?? '')
}

export function WalletButton() {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { disconnect: disconnectAppKit } = useAppKitDisconnect()
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)

  const handleDisconnect = () => {
    disconnect()
    void disconnectAppKit({ namespace: 'eip155' })
  }

  const handleCopy = () => {
    if (!displayAddress) return
    const fallback = () => {
      const ta = document.createElement('textarea')
      ta.value = displayAddress
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(displayAddress).catch(fallback)
    } else {
      fallback()
    }
  }

  if (isWalletConnected && displayAddress) {
    return (
      <div className="nibgate-wallet-container" data-wallet-container>
        <button
          className="nibgate-header-cta"
          type="button"
          data-wallet-connect
          data-connected="true"
          data-address={displayAddress}
          onClick={handleCopy}
        >
          {shortAddress(displayAddress)}
        </button>
        <div className="nibgate-wallet-dropdown" data-wallet-dropdown>
          <Link href="/dashboard" className="dropdown-item">Dashboard</Link>
          <button type="button" className="dropdown-item dropdown-disconnect" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="nibgate-wallet-container" data-wallet-container>
      <button className="nibgate-header-cta" type="button" data-wallet-connect onClick={() => open()}>
        Connect wallet
      </button>
    </div>
  )
}

export function WalletButtonMobile() {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { disconnect: disconnectAppKit } = useAppKitDisconnect()
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)

  const handleDisconnect = () => {
    disconnect()
    void disconnectAppKit({ namespace: 'eip155' })
  }

  if (isWalletConnected && displayAddress) {
    return (
      <div className="nibgate-wallet-container" data-wallet-container style={{ width: '100%' }}>
        <button
          className="nibgate-header-mobile-cta"
          style={{ width: '100%' }}
          type="button"
          data-wallet-connect
          data-connected="true"
          data-address={displayAddress}
        >
          {shortAddress(displayAddress)}
        </button>
        <div className="nibgate-wallet-dropdown mobile-dropdown" data-wallet-dropdown style={{ display: 'flex' }}>
          <Link href="/dashboard" className="dropdown-item" onClick={() => {}}>Dashboard</Link>
          <button type="button" className="dropdown-item dropdown-disconnect" onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="nibgate-wallet-container" data-wallet-container style={{ width: '100%' }}>
      <button className="nibgate-header-mobile-cta" style={{ width: '100%' }} type="button" data-wallet-connect onClick={() => open()}>
        Connect wallet
      </button>
    </div>
  )
}

export function ConnectedWalletButton({ className }: { className?: string }) {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, isConnected } = useAccount()
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)

  if (isWalletConnected && displayAddress) {
    return (
      <button type="button" className={className} style={{ pointerEvents: 'none', opacity: 0.7 }}>
        {shortAddress(displayAddress)}
      </button>
    )
  }

  return (
    <button type="button" className={className} onClick={() => open()}>
      Connect wallet
    </button>
  )
}