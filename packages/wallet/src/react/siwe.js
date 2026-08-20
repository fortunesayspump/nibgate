import { createSignInMessage } from '../siwe.js'
import { toHex } from 'viem'

// Sign a SIWE (or any) message through an EIP-1193 wallet provider. personal_sign
// treats a 0x-prefixed param as raw bytes to sign with the EIP-191 personal_sign
// prefix — the exact encoding wagmi/viem use for signMessageAsync and the one the
// backend's verifyMessage/hashMessage expects. Passing a raw UTF-8 string makes
// strict providers sign the wrong bytes (invalid signature).
export async function signMessageWithProvider(walletProvider, address, message) {
  if (!walletProvider || typeof walletProvider.request !== 'function') {
    throw new Error('Wallet provider is not available. Make sure a wallet is connected.')
  }
  return walletProvider.request({
    method: 'personal_sign',
    params: [toHex(message), address],
  })
}

export async function signInWithSiwe(address, signMessage, options = {}) {
  const authBase = options.authBase || ''
  const noncePath = options.noncePath || `${authBase}/auth/nonce`
  const verifyPath = options.verifyPath || `${authBase}/auth/verify`
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }

  const nonceRes = await fetch(noncePath, { credentials: 'include' })
  const nonceText = await nonceRes.text()
  let nonceData = {}
  try {
    nonceData = nonceText ? JSON.parse(nonceText) : {}
  } catch {}
  if (!nonceRes.ok || !nonceData.nonce) {
    throw new Error(nonceData.error || 'Could not request a sign-in nonce.')
  }

  const host = typeof window !== 'undefined' ? window.location.host : options.domain || ''
  const origin = typeof window !== 'undefined' ? window.location.origin : options.uri || 'https://nibgate.xyz'

  const message = createSignInMessage({
    address,
    nonce: nonceData.nonce,
    domain: host,
    uri: origin,
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
  })

  const signature = await signMessage(message)

  const verifyRes = await fetch(verifyPath, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ message, signature, domain: host }),
  })
  const verifyText = await verifyRes.text()
  let verifyData = {}
  try {
    verifyData = verifyText ? JSON.parse(verifyText) : {}
  } catch {}
  if (!verifyRes.ok || !verifyData.success) {
    throw new Error(verifyData.details || verifyData.error || 'Signature could not be verified.')
  }

  return { message, signature, user: verifyData.user }
}
