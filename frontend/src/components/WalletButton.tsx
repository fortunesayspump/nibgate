'use client'

import { useAppKit, useAppKitAccount, useDisconnect as useAppKitDisconnect } from '@reown/appkit/react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAccount, useChainId, useDisconnect, useSwitchChain } from 'wagmi'
import { arcTestnet } from '../lib/wagmi'
import { getConnectedChainId, isArcTestnetChainId } from '../lib/chains'

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function isHexAddress(address?: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address ?? '')
}

export function WalletButton() {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, chainId, isConnected } = useAccount()
  const activeChainId = useChainId()
  const { disconnect } = useDisconnect()
  const { disconnect: disconnectAppKit } = useAppKitDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isWalletConnected && !isArcTestnetChainId(connectedChainId)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (isWalletConnected && displayAddress && isWrongChain) {
    return (
      <button className="nibgate-header-cta" type="button" onClick={() => switchChain({ chainId: arcTestnet.id })}>
        {isSwitching ? 'Switching...' : 'Switch to Arc'}
      </button>
    )
  }

  if (isWalletConnected && displayAddress) {
    return (
      <div className="nibgate-wallet-container" data-wallet-container ref={menuRef}>
        <button className="nibgate-header-cta" type="button" onClick={() => setMenuOpen((value) => !value)}>
          {shortAddress(displayAddress)}
        </button>
        {menuOpen ? (
          <div className="nibgate-wallet-dropdown" style={{ display: 'block' }}>
            <Link href="/dashboard" className="dropdown-item" onClick={() => setMenuOpen(false)}>Dashboard</Link>
            <button
              type="button"
              className="dropdown-item dropdown-disconnect"
              onClick={() => {
                setMenuOpen(false)
                disconnect()
                void disconnectAppKit({ namespace: 'eip155' })
              }}
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="nibgate-wallet-container" data-wallet-container>
      <button className="nibgate-header-cta" type="button" onClick={() => open()}>
        Connect wallet
      </button>
    </div>
  )
}

export function WalletButtonMobile() {
  const { open } = useAppKit()
  const appKitAccount = useAppKitAccount({ namespace: 'eip155' })
  const { address, chainId, isConnected } = useAccount()
  const activeChainId = useChainId()
  const { disconnect } = useDisconnect()
  const { disconnect: disconnectAppKit } = useAppKitDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const appKitAddress = isHexAddress(appKitAccount.address) ? appKitAccount.address : undefined
  const displayAddress = address ?? appKitAddress
  const isWalletConnected = isConnected || Boolean(appKitAccount.isConnected && appKitAddress)
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isWalletConnected && !isArcTestnetChainId(connectedChainId)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (isWalletConnected && displayAddress && isWrongChain) {
    return (
      <button className="nibgate-header-mobile-cta" style={{ width: '100%' }} type="button" onClick={() => switchChain({ chainId: arcTestnet.id })}>
        {isSwitching ? 'Switching...' : 'Switch to Arc'}
      </button>
    )
  }

  if (isWalletConnected && displayAddress) {
    return (
      <div className="nibgate-wallet-container" data-wallet-container style={{ width: '100%' }} ref={menuRef}>
        <button className="nibgate-header-mobile-cta" style={{ width: '100%' }} type="button" onClick={() => setMenuOpen((value) => !value)}>
          {shortAddress(displayAddress)}
        </button>
        {menuOpen ? (
          <div className="nibgate-wallet-dropdown mobile-dropdown" data-wallet-dropdown style={{ display: 'block' }}>
            <Link href="/dashboard" className="dropdown-item" onClick={() => setMenuOpen(false)}>Dashboard</Link>
            <button
              type="button"
              className="dropdown-item dropdown-disconnect"
              onClick={() => {
                setMenuOpen(false)
                disconnect()
                void disconnectAppKit({ namespace: 'eip155' })
              }}
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="nibgate-wallet-container" data-wallet-container style={{ width: '100%' }}>
      <button className="nibgate-header-mobile-cta" style={{ width: '100%' }} type="button" onClick={() => open()}>
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
      <button type="button" data-wallet-connect className={className} style={{ pointerEvents: 'none', opacity: 0.7 }}>
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