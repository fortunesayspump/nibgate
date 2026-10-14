// Dependency-free transaction state machine. Reads/receipts are injected so
// tests never need a wallet, RPC endpoint, or funded account.
const ADDRESS = /^0x[\da-f]{40}$/i
const HASH = /^0x[\da-f]{64}$/i
const locks = new Set()
const memory = new Map()
const verifiedTerminals = new Set()
const terminalKey = (key, record) => `${key}:${record.status}:${record.transferHash || record.approvalHash}`
const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()

export class GatewayTransferError extends Error {}

export function parseGatewayAmount(value) {
  const text = String(value).trim()
  if (!/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(text)) {
    throw new GatewayTransferError('Enter a positive USDC amount with at most 6 decimal places.')
  }
  const [whole = '', fraction = ''] = text.split('.')
  const units = BigInt(whole || '0') * 1000000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n || units >= 2n ** 256n) throw new GatewayTransferError('Enter a valid positive USDC amount.')
  return units
}

export function gatewayTransferKey({ chainId, gateway, address }) {
  return `nibgate:gateway:v1:${chainId}:${gateway.toLowerCase()}:${address.toLowerCase()}`
}

// sessionStorage survives modal remounts and tab reloads. Write BEFORE sending
// as well as after receiving a hash: a lost wallet response must not resend.
// The memory copy also survives storage failure after a broadcast.
export function createGatewayTransferStore(getStorage) {
  return {
    read(key) {
      if (memory.has(key)) return memory.get(key)
      const raw = getStorage().getItem(key)
      if (raw === null || raw === undefined) return null
      let value
      try { value = JSON.parse(raw) } catch { throw new GatewayTransferError('Saved Gateway transaction is unreadable. Check wallet activity before sending again.') }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GatewayTransferError('Saved Gateway transaction is unreadable. Check wallet activity before sending again.')
      memory.set(key, value)
      return value
    },
    write(key, value) {
      memory.set(key, { ...value })
      try { getStorage().setItem(key, JSON.stringify(value)) } catch {
        throw new GatewayTransferError('Cannot save Gateway transaction recovery data. Keep this tab open and check wallet activity before sending again.')
      }
    },
    clear(key) {
      getStorage().removeItem(key)
      memory.delete(key)
    },
  }
}

export function clearGatewayTransfer({ store, key }) {
  if (locks.has(key)) throw new GatewayTransferError('A Gateway transaction is already in progress.')
  const record = store.read(key)
  if (record && !['confirmed', 'reverted'].includes(record.status) && (record.approvalHash || record.transferHash || record.submitting)) {
    throw new GatewayTransferError('Finish checking the pending Gateway transaction before starting another.')
  }
  if (record && ['confirmed', 'reverted'].includes(record.status) && !verifiedTerminals.has(terminalKey(key, record))) {
    throw new GatewayTransferError('Check the saved transaction receipt before starting another transfer.')
  }
  store.clear(key)
}

export async function runGatewayTransfer({
  provider, address, kind, amount, chainId, gateway, usdc, store,
  ensureNetwork, checkConnection, waitForReceipt, getTransaction, assertActive, onUpdate = () => {},
}) {
  if (!provider?.request) throw new GatewayTransferError('Connect an EVM wallet before continuing.')
  if (!ADDRESS.test(address) || !ADDRESS.test(gateway) || !ADDRESS.test(usdc)) throw new GatewayTransferError('Gateway wallet address is invalid.')
  if (!['deposit', 'withdraw'].includes(kind)) throw new GatewayTransferError('Invalid Gateway action.')
  const key = gatewayTransferKey({ chainId, gateway, address })
  if (locks.has(key)) throw new GatewayTransferError('A Gateway transaction is already in progress.')
  locks.add(key)
  let invalidated = false
  let checkChainEvents = false
  const invalidate = () => { invalidated = true }
  const onAccounts = (accounts) => { if (!sameAddress(accounts?.[0], address)) invalidate() }
  const onChain = (id) => { if (checkChainEvents && Number(id) !== chainId) invalidate() }
  const guard = () => {
    assertActive()
    if (invalidated) throw new GatewayTransferError('The wallet account, connection, or network changed. Reconnect the original wallet to resume.')
  }
  const checkAccount = async () => {
    guard()
    const accounts = await provider.request({ method: 'eth_accounts' })
    guard()
    if (!sameAddress(accounts?.[0], address)) throw new GatewayTransferError('The connected wallet account does not match the displayed address. Reconnect it before continuing.')
  }
  const checkWallet = async () => {
    await checkAccount()
    const id = await provider.request({ method: 'eth_chainId' })
    guard()
    if (Number(id) !== chainId) throw new GatewayTransferError('The wallet is on the wrong network. Switch back before continuing.')
  }
  let record
  const update = (patch, message) => {
    record = { ...record, ...patch }
    store.write(key, record)
    onUpdate({ ...record }, message)
  }
  const confirm = async (stage, hash) => {
    onUpdate({ ...record }, stage === 'approval' ? 'Waiting for approval confirmation…' : `Waiting for ${record.kind} confirmation…`)
    const receipt = await waitForReceipt(hash)
    if (!sameAddress(receipt?.transactionHash, hash)) throw new GatewayTransferError('The receipt does not match the submitted transaction. Check wallet activity before continuing.')
    const transaction = await getTransaction(hash)
    const units = parseGatewayAmount(record.amount).toString(16).padStart(64, '0')
    const expectedTo = stage === 'approval' ? usdc : gateway
    const token = stage === 'approval' ? gateway : usdc
    const selector = stage === 'approval' ? '0x095ea7b3' : record.kind === 'deposit' ? '0x47e7ef24' : '0xf3fef3a3'
    const expectedData = `${selector}${token.slice(2).padStart(64, '0')}${units}`
    if (!sameAddress(transaction?.hash, hash) || !sameAddress(transaction?.from, address) || !sameAddress(transaction?.to, expectedTo) || transaction?.input?.toLowerCase() !== expectedData.toLowerCase() || Number(transaction?.chainId) !== chainId || BigInt(transaction?.value ?? -1) !== 0n) {
      throw new GatewayTransferError('The saved transaction does not match this Gateway transfer. Check wallet activity before continuing.')
    }
    if (receipt?.status === 'reverted' || receipt?.status === '0x0' || receipt?.status === 0) {
      verifiedTerminals.add(terminalKey(key, { ...record, status: 'reverted' }))
      update({ status: 'reverted' }, `${stage === 'approval' ? 'Approval' : record.kind} reverted.`)
      throw new GatewayTransferError(`${stage === 'approval' ? 'Approval' : 'Gateway transaction'} reverted. No successful ${record.kind} was confirmed.`)
    }
    if (!['success', '0x1', 1].includes(receipt?.status)) throw new GatewayTransferError('Transaction confirmation is still pending. Check the saved transaction; do not send it again.')
    if (stage === 'transfer') verifiedTerminals.add(terminalKey(key, { ...record, status: 'confirmed' }))
  }
  const send = async (stage, to, data) => {
    await checkConnection(provider, { assertActive: guard })
    await checkWallet()
    update({ submitting: stage }, stage === 'approval' ? 'Approve USDC in your wallet…' : `Confirm ${record.kind} in your wallet…`)
    // No await between the final session guard and the actual send.
    guard()
    let hash
    try {
      hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: address, to, data, chainId: `0x${chainId.toString(16)}` }] })
    } catch (error) {
      // These responses explicitly mean the wallet did not authorize a send.
      // Other errors may conceal a successful broadcast; preserve the marker.
      if ([4001, 4100, 4200].includes(Number(error?.code))) update({ submitting: null })
      throw error
    }
    if (!HASH.test(hash)) throw new GatewayTransferError('The wallet did not return a transaction hash. Check wallet activity before sending again.')
    update({ [stage === 'approval' ? 'approvalHash' : 'transferHash']: hash, submitting: null }, 'Transaction submitted; waiting for confirmation…')
    return hash
  }
  try {
    provider.on?.('accountsChanged', onAccounts)
    provider.on?.('chainChanged', onChain)
    provider.on?.('disconnect', invalidate)
    guard()
    record = store.read(key)
    if (record) {
      if (
        record.chainId !== chainId || !sameAddress(record.address, address) ||
        !sameAddress(record.gateway, gateway) || !sameAddress(record.usdc, usdc) ||
        !['deposit', 'withdraw'].includes(record.kind) ||
        !['pending', 'confirmed', 'reverted'].includes(record.status) ||
        (record.approvalHash !== null && !HASH.test(record.approvalHash)) ||
        (record.transferHash !== null && !HASH.test(record.transferHash)) ||
        ![null, 'approval', 'transfer'].includes(record.submitting) ||
        (record.status === 'confirmed' && !record.transferHash) ||
        (record.status === 'reverted' && !record.approvalHash && !record.transferHash) ||
        (record.kind === 'deposit' && record.transferHash && !record.approvalHash)
      ) {
        throw new GatewayTransferError('Saved Gateway transaction does not match this wallet. Check wallet activity before sending again.')
      }
      parseGatewayAmount(record.amount)
      if (record.kind !== kind) throw new GatewayTransferError(`Resume the saved ${record.kind} before starting another Gateway action.`)
      if (record.submitting) throw new GatewayTransferError('A wallet request was interrupted before its hash was saved. Check wallet activity; do not submit another transaction.')
      if (record.status === 'reverted' && !record.transferHash) {
        await confirm('approval', record.approvalHash)
        throw new GatewayTransferError('The saved approval outcome changed. Check wallet activity before continuing.')
      }
    } else {
      parseGatewayAmount(amount)
      record = { chainId, address, gateway, usdc, kind, amount: String(amount), status: 'pending', submitting: null, approvalHash: null, transferHash: null }
    }
    // Already submitted transfers need receipts only, never a second send.
    if (record.transferHash) {
      await confirm('transfer', record.transferHash)
      update({ status: 'confirmed' }, `${kind === 'deposit' ? 'Deposited' : 'Withdrawn'}!`)
      return record
    }
    await checkAccount()
    await ensureNetwork(provider, { assertActive: guard }) // Rejection/failure MUST stop the flow.
    await checkWallet()
    checkChainEvents = true
    const units = parseGatewayAmount(record.amount).toString(16).padStart(64, '0')
    const addr32 = (value) => value.slice(2).padStart(64, '0')
    if (kind === 'deposit') {
      const approvalHash = record.approvalHash || await send('approval', usdc, `0x095ea7b3${addr32(gateway)}${units}`)
      await confirm('approval', approvalHash)
      guard()
    }
    const hash = await send('transfer', gateway, `${kind === 'deposit' ? '0x47e7ef24' : '0xf3fef3a3'}${addr32(usdc)}${units}`)
    await confirm('transfer', hash)
    update({ status: 'confirmed' }, `${kind === 'deposit' ? 'Deposited' : 'Withdrawn'}!`)
    return record
  } finally {
    provider.removeListener?.('accountsChanged', onAccounts)
    provider.removeListener?.('chainChanged', onChain)
    provider.removeListener?.('disconnect', invalidate)
    locks.delete(key)
  }
}
