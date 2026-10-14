import { createHash } from 'node:crypto';
import { verifyTypedData, createPublicClient, http } from 'viem';
import { networkByChainId } from '@nibgate/internal/networks.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const TIP_CLAIM_PREFIX = 'nibgate:tip-idempotency:v1:';
export const isTipClaimMetadata = (value) => String(value || '').startsWith(TIP_CLAIM_PREFIX);
const encodeClaim = (meta) => TIP_CLAIM_PREFIX + JSON.stringify(meta);
const conflict = (code = 'payment-proof-already-used') => Object.assign(new Error(code === 'payment-verification-pending'
  ? 'Payment verification is pending or requires reconciliation. Do not submit a new payment.'
  : 'Payment proof is already reserved or recorded with a different binding. Check the original receipt; do not pay again.'), { code });

// An exact digest of the previously verified complete signed envelope is proof
// of possession on replay. A public nonce or claimed wallet is never sufficient.
export async function gatewayTipIdentity(signature, network, requirement) {
  let envelope;
  try { envelope = JSON.parse(Buffer.from(signature, 'base64').toString('utf8')); } catch { throw new Error('Invalid Gateway payment proof.'); }
  const auth = envelope?.payload?.authorization;
  const payer = String(auth?.from || '').toLowerCase();
  const nonce = String(auth?.nonce || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(payer) || !/^0x[0-9a-f]{64}$/.test(nonce) || !envelope?.payload?.signature) throw new Error('Gateway proof requires a signed authorization.');
  const accepted = envelope.accepted;
  const extra = requirement?.extra;
  if (!requirement || requirement.network !== network || extra?.name !== 'GatewayWalletBatched' || extra?.version !== '1'
      || accepted?.network !== network || accepted?.scheme !== requirement.scheme
      || String(accepted?.asset).toLowerCase() !== String(requirement.asset).toLowerCase()
      || String(accepted?.payTo || accepted?.recipient).toLowerCase() !== String(requirement.payTo || requirement.recipient).toLowerCase()
      || String(auth.to).toLowerCase() !== String(requirement.payTo || requirement.recipient).toLowerCase()
      || String(accepted?.extra?.verifyingContract).toLowerCase() !== String(extra.verifyingContract).toLowerCase()
      || accepted?.extra?.name !== extra.name || accepted?.extra?.version !== extra.version
      || BigInt(auth.value) !== BigInt(requirement.amount) || BigInt(accepted.amount) !== BigInt(requirement.amount)) throw new Error('Gateway proof does not match the server payment requirement.');
  const verification = {
    address: payer,
    domain: { name: extra.name, version: extra.version, chainId: Number(network.split(':')[1]), verifyingContract: extra.verifyingContract },
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    primaryType: 'TransferWithAuthorization',
    message: { ...auth, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore) },
    signature: envelope.payload.signature,
  };
  let valid = false;
  try { valid = await verifyTypedData(verification); } catch { /* Contract signatures need chain verification. */ }
  if (!valid) {
    const net = networkByChainId(network);
    if (!net) throw new Error('Unsupported Gateway proof network.');
    const rpcUrl = process.env.NIBGATE_PAYMENT_RPC_URL || process.env.ARC_RPC_URL || net.rpcUrl;
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: 5000, retryCount: 0 }) });
    try {
      if (await client.getChainId() !== net.chainId) throw new Error('Signature verification RPC network mismatch.');
      valid = await client.verifyTypedData(verification);
    } catch (cause) {
      throw Object.assign(new Error('Could not verify the wallet signature on the trusted network. No payment intent was reserved.'), { cause });
    }
  }
  if (!valid) throw new Error('Invalid Gateway authorization signature.');
  return { key: `gateway:${network}:${payer}:${nonce}`, digest: digest(envelope), payer, nonce, signature, network, networkName: networkByChainId(network)?.name, validAfter: Number(auth.validAfter), validBefore: Number(auth.validBefore), gateway: true };
}
export function transferTipIdentity(txHash) {
  if (!/^0x[0-9a-f]{64}$/i.test(txHash || '')) throw new Error('A valid transaction hash is required.');
  return { key: txHash.toLowerCase(), digest: digest(txHash.toLowerCase()), gateway: false };
}
export function tipRequestBinding(body, { network, payee, status }) {
  return digest({
    network, payee: String(payee).toLowerCase(), status,
    contentUrl: body.contentUrl || body.url || '', title: body.title || '',
    amount: String(Number(body.amount)), currency: body.currency || 'USDC',
    recipient: String(body.recipient || '').toLowerCase(),
    domain: body.domain || '', contentId: body.contentId || '', websiteId: body.websiteId || '',
    imageUrl: body.imageUrl || '', walletAddress: String(body.walletAddress || '').toLowerCase(),
  });
}

// No remote settlement occurs under a long-lived SQL transaction. A durable
// intent serializes first submission; completion commits the receipt and claim
// together. Crashes or ambiguous settlement stay pending for reconciliation.
export async function recordTipOnce({ db, identity, binding, verify, makeData }) {
  const readExisting = async () => {
    const claim = await db.paymentTxClaim.findUnique({ where: { txHash: identity.key } });
    let meta;
    try { if (isTipClaimMetadata(claim?.contentId)) meta = JSON.parse(claim.contentId.slice(TIP_CLAIM_PREFIX.length)); } catch {}
    if (meta?.v !== 'tip-v1' || meta.digest !== identity.digest || meta.binding !== binding) throw conflict();
    if (meta.state !== 'complete' || !meta.tipId) throw conflict('payment-verification-pending');
    const row = await db.tip.findUnique({ where: { id: meta.tipId } });
    if (!row || row.status !== meta.status) throw conflict();
    const paid = identity.gateway
      ? { payer: identity.payer, paymentId: identity.key, receiptTxHash: row.txHash, provider: 'circle-gateway' }
      : await verify();
    const expected = await makeData(paid);
    // Metadata alone is not authority: compare the actual ledger row against
    // the independently verified proof and this request's complete attribution.
    if (identity.gateway && row.paymentId !== identity.key) throw conflict();
    const projected = Object.fromEntries(Object.keys(expected).map((key) => [key, row[key]]));
    if (digest(projected) !== digest(expected)) throw conflict();
    return { row, replayed: true };
  };
  // Gateway replay recovery never reaches facilitator settlement. Direct
  // replays recheck chain evidence read-only. Legacy claims fail closed.
  if (await db.paymentTxClaim.findUnique({ where: { txHash: identity.key } })) return readExisting();
  const where = identity.gateway
    ? { paymentProvider: 'circle-gateway', payerWallet: { equals: identity.payer, mode: 'insensitive' }, OR: [{ network: null }, { network: { in: [identity.network, identity.networkName] } }] }
    : { OR: [{ txHash: { equals: identity.key, mode: 'insensitive' } }, { paymentId: { equals: identity.key, mode: 'insensitive' } }] };
  const legacy = await db.tip.findMany({ where });
  for (const row of legacy) {
    if (!identity.gateway) throw conflict();
    if (row.paymentId === identity.signature || row.paymentId === identity.key) throw conflict();
    try {
      const auth = JSON.parse(Buffer.from(row.paymentId || '', 'base64').toString('utf8')).payload?.authorization;
      if (String(auth?.nonce || '').toLowerCase() === identity.nonce) throw conflict();
    } catch (error) { if (error.code) throw error; }
  }
  if (identity.gateway && (identity.validAfter >= Date.now() / 1000 || identity.validBefore <= Date.now() / 1000)) throw new Error('Gateway authorization is outside its validity window.');
  // Chain receipt reads are safe to repeat and must not reserve an unmined tx.
  let payment = identity.gateway ? null : await verify();
  const meta = { v: 'tip-v1', state: 'pending', digest: identity.digest, binding };
  try {
    await db.paymentTxClaim.create({ data: { txHash: identity.key, contentId: encodeClaim(meta) } });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    return readExisting();
  }
  // Never delete this reservation automatically after an ambiguous failure.
  try {
    if (identity.gateway) payment = await verify();
    const data = await makeData(payment);
    const row = await db.$transaction(async (tx) => {
      const created = await tx.tip.create({ data });
      await tx.paymentTxClaim.update({ where: { txHash: identity.key }, data: { contentId: encodeClaim({ ...meta, state: 'complete', tipId: created.id, status: created.status }) } });
      return created;
    });
    return { row, replayed: false };
  } catch (cause) {
    throw Object.assign(conflict('payment-verification-pending'), { cause });
  }
}
