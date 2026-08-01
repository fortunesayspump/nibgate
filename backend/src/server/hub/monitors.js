import { db } from '@nibgate/internal/db.js';
import { createPublicClient, decodeEventLog, http } from 'viem';
import {
  checkWebsiteVerification, syncWebsiteManifest, serializeContent,
  CONTENT_RATED_EVENT, siteReputationScore, creatorReputationScore,
  primaryWalletAddress, contentHashFor, findContentByHash,
  upsertOnchainRatingForContent
} from './helpers.js';

let verificationMonitorStarted = false;
let manifestSyncMonitorStarted = false;
let reputationIndexerStarted = false;
let dataIntegrityMonitorStarted = false;
let reputationIndexerLastBlock = null;

const DEFAULT_NIBGATE_REPUTATION_CONTRACT = '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
const DEFAULT_ARC_RPC_URL = 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/';

// ── Verification Monitor ───────────────────────────────────────────────────

async function runVerificationSweep() {
  const websites = await db.website.findMany({
    where: {
      deletedAt: null,
      OR: [
        { verificationStatus: { not: 'verified' } },
        { lastVerificationCheckAt: null },
        { isVerified: false },
        { lastVerificationCheckAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) } }
      ]
    }
  });

  for (const website of websites) {
    // Subblog sites are verified by being linked to a hub wallet (ownerId set),
    // not by a homepage widget check. Skip the widget sweep for them entirely.
    if (website.domain?.endsWith('.nibgate.xyz')) {
      if (website.ownerId) {
        await db.website.update({
          where: { id: website.id },
          data: { isVerified: true, verificationStatus: 'verified', verificationFailureReason: null, lastVerificationCheckAt: new Date() }
        }).catch(() => {});
      }
      continue;
    }

    // Externally hosted sites are verified by the widget on their homepage.
    const result = await checkWebsiteVerification(website);
    if (!result.ok && result.status === 'failed' && website.verificationStatus === 'verified') {
      // Transient fetch failure — never demote an already-verified site.
      // Keep it verified and retry on the next sweep.
      await db.website.update({
        where: { id: website.id },
        data: { lastVerificationCheckAt: new Date() }
      }).catch((error) => {
        console.log(`Verification sweep fetch-failure kept verified for ${website.domain}:`, error.message);
      });
      console.log(`Verification sweep: transient fetch failure for ${website.domain}, kept verified`);
      continue;
    }
    await db.website.update({
      where: { id: website.id },
      data: result.data
    }).catch((error) => {
      console.log(`Verification sweep failed for ${website.domain}:`, error.message);
    });
  }
}

export function startVerificationMonitor() {
  if (verificationMonitorStarted || process.env.VERIFICATION_CHECKS_DISABLED === 'true') return;
  verificationMonitorStarted = true;

  const intervalMs = Number.parseInt(process.env.VERIFICATION_CHECK_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10);
  const initialDelayMs = Number.parseInt(process.env.VERIFICATION_CHECK_INITIAL_DELAY_MS || String(10 * 60 * 1000), 10);

  setTimeout(() => {
    runVerificationSweep().catch((error) => console.log('Verification sweep failed:', error.message));
    setInterval(() => {
      runVerificationSweep().catch((error) => console.log('Verification sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}

// ── Manifest Sync Monitor ─────────────────────────────────────────────────

async function runManifestSyncSweep() {
  const retryAfterMs = Number.parseInt(process.env.MANIFEST_SYNC_RETRY_AFTER_MS || String(30 * 60 * 1000), 10);
  const retryAfter = new Date(Date.now() - retryAfterMs);
  const websites = await db.website.findMany({
    where: {
      deletedAt: null,
      isVerified: true,
      verificationStatus: 'verified',
      OR: [
        { lastScanStatus: null },
        { lastScanStatus: { not: 'failed' } },
        { lastScanAt: { lt: retryAfter } }
      ]
    },
    orderBy: [
      { lastScanAt: 'asc' },
      { createdAt: 'desc' }
    ],
    take: Number.parseInt(process.env.MANIFEST_SYNC_BATCH_SIZE || '100', 10)
  });

  for (const website of websites) {
    const result = await syncWebsiteManifest(website);
    if (!result.ok && process.env.MANIFEST_SYNC_LOG_FAILURES !== 'false') {
      console.log(`Manifest sync failed for ${website.domain}: ${result.error}`);
    }
  }
}

export function startManifestSyncMonitor() {
  if (manifestSyncMonitorStarted || process.env.MANIFEST_SYNC_DISABLED === 'true') return;
  manifestSyncMonitorStarted = true;

  const intervalMs = Number.parseInt(process.env.MANIFEST_SYNC_INTERVAL_MS || String(15 * 60 * 1000), 10);
  const initialDelayMs = Number.parseInt(process.env.MANIFEST_SYNC_INITIAL_DELAY_MS || '15000', 10);

  setTimeout(() => {
    runManifestSyncSweep().catch((error) => console.log('Manifest sync sweep failed:', error.message));
    setInterval(() => {
      runManifestSyncSweep().catch((error) => console.log('Manifest sync sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}

// ── Reputation Indexer ─────────────────────────────────────────────────────

function publicClientForIndexer() {
  const rpcUrl = process.env.ARC_RPC_URL || process.env.NIBGATE_REPUTATION_RPC_URL || process.env.ARC_TESTNET_RPC_URL || process.env.RPC_URL || DEFAULT_ARC_RPC_URL;
  const chainId = Number.parseInt(process.env.NIBGATE_REPUTATION_CHAIN_ID || process.env.CHAIN_ID || '5042002', 10);
  if (!rpcUrl) return null;
  return createPublicClient({
    chain: {
      id: chainId,
      name: process.env.NIBGATE_REPUTATION_CHAIN_NAME || 'Arc Testnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    },
    transport: http(rpcUrl)
  });
}

async function indexReputationLog(log, contractAddress) {
  if (String(log.address || '').toLowerCase() !== contractAddress) return { ok: false, reason: 'wrong_contract' };

  let decoded;
  try {
    decoded = decodeEventLog({
      abi: [CONTENT_RATED_EVENT],
      data: log.data,
      topics: log.topics
    });
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }

  if (decoded.eventName !== 'ContentRated') return { ok: false, reason: 'wrong_event' };

  const content = await findContentByHash(decoded.args.contentId);
  if (!content) return { ok: false, reason: 'content_not_found' };

  return upsertOnchainRatingForContent(content, decoded.args, log.transactionHash);
}

async function runReputationIndexSweep() {
  const contractAddress = String(process.env.NIBGATE_REPUTATION_CONTRACT || DEFAULT_NIBGATE_REPUTATION_CONTRACT).toLowerCase();
  if (!contractAddress) return { ok: false, reason: 'missing_contract' };

  const client = publicClientForIndexer();
  if (!client) return { ok: false, reason: 'missing_rpc' };

  const latestBlock = await client.getBlockNumber();
  const backfillBlocks = BigInt(Number.parseInt(process.env.NIBGATE_REPUTATION_BACKFILL_BLOCKS || '5000', 10));
  const fromBlock = reputationIndexerLastBlock === null
    ? latestBlock > backfillBlocks ? latestBlock - backfillBlocks : 0n
    : reputationIndexerLastBlock + 1n;
  const toBlock = latestBlock;
  if (fromBlock > toBlock) return { ok: true, indexed: 0, fromBlock: String(fromBlock), toBlock: String(toBlock) };

  const logs = await client.getLogs({
    address: contractAddress,
    event: CONTENT_RATED_EVENT,
    fromBlock,
    toBlock
  });

  let indexed = 0;
  for (const log of logs) {
    const result = await indexReputationLog(log, contractAddress);
    if (result.ok) indexed += 1;
  }

  reputationIndexerLastBlock = toBlock;
  return { ok: true, indexed, fromBlock: String(fromBlock), toBlock: String(toBlock) };
}

export function startReputationIndexer() {
  if (reputationIndexerStarted || process.env.NIBGATE_REPUTATION_INDEXER_DISABLED === 'true') return;
  reputationIndexerStarted = true;

  const intervalMs = Number.parseInt(process.env.NIBGATE_REPUTATION_INDEX_INTERVAL_MS || '30000', 10);
  const initialDelayMs = Number.parseInt(process.env.NIBGATE_REPUTATION_INDEX_INITIAL_DELAY_MS || '10000', 10);

  setTimeout(() => {
    runReputationIndexSweep().catch((error) => console.log('Reputation index sweep failed:', error.message));
    setInterval(() => {
      runReputationIndexSweep().catch((error) => console.log('Reputation index sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}

// ── Data Integrity Monitor (verification sweep) ─────────────────────────────

function looksLikeOnchainHash(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40,}$/.test(value);
}

function looksLikeValidPaymentId(value) {
  return typeof value === 'string' && value.length >= 10 && !value.startsWith('0x');
}

async function runDataIntegritySweep() {
  // 1. Ratings: reject those without a valid on-chain proof hash
  try {
    const badRatings = await db.contentRating.findMany({
      where: {
        status: 'accepted',
        OR: [
          { proof: null },
          { proof: '' },
          { proof: { not: { startsWith: 'onchain:' } } },
        ],
      },
      take: 500,
    });
    for (const r of badRatings) {
      await db.contentRating.update({
        where: { id: r.id },
        data: { status: 'rejected' },
      }).catch(() => {});
    }
    if (badRatings.length) console.log(`Data integrity: rejected ${badRatings.length} ratings without on-chain proof`);
  } catch (error) {
    console.log('Data integrity sweep (ratings) failed:', error.message);
  }

  // 2. Ratings: verify on-chain proofs actually exist on the reputation chain (sample-based)
  try {
    const client = publicClientForIndexer();
    const toVerify = await db.contentRating.findMany({
      where: { status: 'accepted', proof: { startsWith: 'onchain:' } },
      select: { id: true, proof: true },
      take: 100,
    });
    for (const r of toVerify) {
      const hash = String(r.proof || '').replace('onchain:', '');
      if (!looksLikeOnchainHash(hash)) {
        await db.contentRating.update({ where: { id: r.id }, data: { status: 'rejected' } }).catch(() => {});
        continue;
      }
      if (client) {
        try {
          const tx = await client.getTransaction({ hash });
          if (!tx) {
            await db.contentRating.update({ where: { id: r.id }, data: { status: 'rejected' } }).catch(() => {});
          }
        } catch (e) {
          // RPC error — leave as is, retry next sweep
        }
      }
    }
  } catch (error) {
    console.log('Data integrity sweep (onchain ratings) failed:', error.message);
  }

  // 3. Unlock receipts: reject malformed ones (missing provider, truncated hashes)
  try {
    const badReceipts = await db.unlockReceipt.findMany({
      where: {
        OR: [
          { paymentProvider: null },
          { paymentProvider: '' },
          { paymentId: null },
          { paymentId: '' },
        ],
      },
      take: 500,
    });
    for (const r of badReceipts) {
      await db.unlockReceipt.update({
        where: { id: r.id },
        data: { status: 'invalid' },
      }).catch(() => {});
    }
    if (badReceipts.length) console.log(`Data integrity: marked ${badReceipts.length} unlock receipts invalid`);

    // Truncated 0x hashes are invalid for gateway unlocks. Direct-transfer unlocks
    // legitimately use on-chain tx hashes, so a 0x hash is valid there.
    const gateways = await db.unlockReceipt.findMany({
      where: { status: 'verified', paymentProvider: 'circle-gateway', txHash: { startsWith: '0x' } },
      select: { id: true, txHash: true },
      take: 500,
    });
    for (const r of gateways) {
      if (!looksLikeValidPaymentId(r.txHash)) {
        await db.unlockReceipt.update({ where: { id: r.id }, data: { status: 'invalid' } }).catch(() => {});
      }
    }
    if (gateways.length) console.log(`Data integrity: checked ${gateways.length} 0x-prefixed gateway receipts`);

    // Direct-transfer receipts: verify the tx exists on-chain
    const transfers = await db.unlockReceipt.findMany({
      where: { status: 'verified', paymentProvider: 'direct-transfer' },
      select: { id: true, txHash: true },
      take: 200,
    });
    const client = publicClientForIndexer();
    for (const r of transfers) {
      const hash = r.txHash;
      if (!looksLikeOnchainHash(hash)) {
        await db.unlockReceipt.update({ where: { id: r.id }, data: { status: 'invalid' } }).catch(() => {});
        continue;
      }
      if (client) {
        try {
          const tx = await client.getTransaction({ hash });
          if (!tx) {
            await db.unlockReceipt.update({ where: { id: r.id }, data: { status: 'invalid' } }).catch(() => {});
          }
        } catch (e) {
          // RPC error — leave as is, retry next sweep
        }
      }
    }
    if (transfers.length) console.log(`Data integrity: verified ${transfers.length} direct-transfer receipts`);
  } catch (error) {
    console.log('Data integrity sweep (receipts) failed:', error.message);
  }
}

export function startDataIntegrityMonitor() {
  if (dataIntegrityMonitorStarted || process.env.DATA_INTEGRITY_MONITOR_DISABLED === 'true') return;
  dataIntegrityMonitorStarted = true;

  const intervalMs = Number.parseInt(process.env.DATA_INTEGRITY_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10);
  const initialDelayMs = Number.parseInt(process.env.DATA_INTEGRITY_INITIAL_DELAY_MS || '60000', 10);

  setTimeout(() => {
    runDataIntegritySweep().catch((error) => console.log('Data integrity sweep failed:', error.message));
    setInterval(() => {
      runDataIntegritySweep().catch((error) => console.log('Data integrity sweep failed:', error.message));
    }, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}
