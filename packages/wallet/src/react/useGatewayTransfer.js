'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { createPublicClient, http } from 'viem'
import { activeArcChain, activeChain, appRpcUrlFor } from '../chain.js'
import { checkArcConnection, ensureArcNetwork, repairArcNetwork } from '../network.js'
import { getWalletErrorMessage } from '../errors.js'
import {
  GatewayTransferError, createGatewayTransferStore, gatewayTransferKey,
  clearGatewayTransfer, runGatewayTransfer,
} from '../gateway-transactions.js'

const chain = activeChain()
const gateway = chain.id === 5042
  ? '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE'
  : '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
const usdc = '0x3600000000000000000000000000000000000000'
const publicClient = createPublicClient({ chain: activeArcChain(), transport: http(appRpcUrlFor()) })
const store = createGatewayTransferStore(() => window.sessionStorage)

export function useGatewayTransfer(address) {
  const { walletProvider } = useAppKitProvider('eip155')
  const { address: connectedAddress, isConnected } = useAppKitAccount()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [transfer, setTransfer] = useState(null)
  const running = useRef(false)
  const mounted = useRef(true)
  const lifecycle = useRef(0)
  const selection = useRef(null)
  const previous = selection.current
  if (!previous || previous.walletProvider !== walletProvider || previous.address !== address || previous.connectedAddress !== connectedAddress || previous.isConnected !== isConnected) {
    selection.current = { walletProvider, address, connectedAddress, isConnected }
  }
  const key = address ? gatewayTransferKey({ chainId: chain.id, gateway, address }) : null
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; lifecycle.current += 1 }
  }, [])
  useEffect(() => {
    try {
      const saved = key ? store.read(key) : null
      setTransfer(saved)
      setStatus(saved ? `Saved ${saved.kind} ${saved.amount} USDC: ${saved.status}.` : '')
    } catch { setStatus('Cannot read Gateway recovery data. Check wallet activity before continuing.') }
  }, [key])

  async function run(kind, amount) {
    if (running.current) return null
    running.current = true
    setBusy(true)
    const selected = selection.current
    const revision = lifecycle.current
    const assertActive = () => {
      if (!mounted.current || lifecycle.current !== revision || selection.current !== selected || !selected?.isConnected || selected.walletProvider !== walletProvider || selected.address !== address || selected.address?.toLowerCase() !== selected.connectedAddress?.toLowerCase()) {
        throw new GatewayTransferError('The connected wallet changed. Reconnect the displayed account to continue.')
      }
    }
    try {
      const result = await runGatewayTransfer({
        provider: walletProvider, address, kind, amount, chainId: chain.id, gateway, usdc, store,
        ensureNetwork: ensureArcNetwork,
        checkConnection: checkArcConnection,
        // Fixed-chain public reads continue to verify a broadcast even if the
        // selected wallet changes. Only another send needs that wallet again.
        waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash, timeout: 120000, checkReplacement: false }),
        getTransaction: (hash) => publicClient.getTransaction({ hash }),
        assertActive,
        onUpdate: (value, message) => {
          if (!mounted.current || selection.current !== selected) return
          setTransfer(value)
          if (message) setStatus(message)
        },
      })
      return result
    } catch (error) {
      if (mounted.current && selection.current === selected) {
        let saved
        try { saved = key ? store.read(key) : null; setTransfer(saved) } catch { /* keep visible hashes */ }
        const message = saved?.submitting
          ? 'The wallet request ended without a saved hash. Check wallet activity; do not submit another transaction.'
          : error instanceof GatewayTransferError ? error.message : getWalletErrorMessage(error)
        setStatus(`${message || 'Gateway transaction could not be confirmed.'}${saved?.status === 'pending' && (saved.approvalHash || saved.transferHash) ? ' Resume to check the saved transaction; do not send it again.' : ''}`)
      }
      return null
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function repairConnection() {
    if (running.current) return false
    running.current = true
    setBusy(true)
    const selected = selection.current
    const revision = lifecycle.current
    const assertActive = () => {
      if (!mounted.current || lifecycle.current !== revision || selection.current !== selected || !selected?.isConnected || selected.walletProvider !== walletProvider || selected.address !== address || selected.address?.toLowerCase() !== selected.connectedAddress?.toLowerCase()) {
        throw new GatewayTransferError('The connected wallet changed. Reconnect the displayed account before repairing it.')
      }
    }
    const checkAccount = async () => {
      assertActive()
      if (!walletProvider?.request) throw new GatewayTransferError('Connect an EVM wallet before repairing it.')
      const accounts = await walletProvider.request({ method: 'eth_accounts' })
      assertActive()
      if (accounts?.[0]?.toLowerCase() !== address.toLowerCase()) {
        throw new GatewayTransferError('The connected wallet account does not match the displayed address.')
      }
    }
    try {
      await checkAccount()
      setStatus(`Repairing ${chain.name} connection…`)
      await repairArcNetwork(walletProvider, { assertActive })
      await checkAccount()
      // Repair only changes network settings and verifies liveness. It never
      // clears the journal, retries a send, or resumes an approval/deposit.
      const saved = key ? store.read(key) : null
      setStatus(saved?.submitting
        ? 'Wallet RPC is responding. Check wallet activity for the interrupted request before any further payment.'
        : saved?.status === 'pending'
          ? 'Wallet RPC is responding. Your saved transaction is unchanged; use Resume to continue checking it.'
          : 'Wallet RPC is responding. Continue when you are ready.')
      return true
    } catch (error) {
      if (mounted.current && selection.current === selected) {
        setStatus(error instanceof GatewayTransferError ? error.message : getWalletErrorMessage(error) || 'Wallet connection repair could not be verified.')
      }
      return false
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function reset() {
    if (!key || running.current) return
    if (transfer && ['confirmed', 'reverted'].includes(transfer.status)) await run(transfer.kind, transfer.amount)
    if (running.current) return
    try {
      clearGatewayTransfer({ store, key })
      setTransfer(null)
      setStatus('')
    } catch (error) { setStatus(error instanceof GatewayTransferError ? error.message : 'Cannot clear Gateway recovery data.') }
  }

  return { run, reset, repairConnection, busy, status, transfer }
}
