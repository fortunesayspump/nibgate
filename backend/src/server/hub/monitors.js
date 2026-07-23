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
let reputationIndexerLastBlock = null;

const DEFAULT_NIBGATE_REPUTATION_CONTRACT = '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';
const DEFAULT_NIBGATE_REPUTATION_RPC_URL = 'https://rpc.testnet.arc-node.thecanteenapp.com/v1/';

// ── Verification Monitor ───────────────────────────────────────────────────

async function runVerificationSweep() {
  const websites = await db.website.findMany({
    where: {
      deletedAt: null,
      OR: [
        { verificationStatus: { not: 'verified' } },
        { lastVerificationCheckAt: null },
        { isVerified: false },
        { lastVerificationCheckAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      ]
    }
  });

  for (const website of websites) {
    const result = await checkWebsiteVerification(website);
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

  const intervalMs = Number.parseInt(process.env.VERIFICATION_CHECK_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10);
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
  const rpcUrl = process.env.NIBGATE_REPUTATION_RPC_URL || process.env.ARC_TESTNET_RPC_URL || process.env.RPC_URL || DEFAULT_NIBGATE_REPUTATION_RPC_URL;
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
