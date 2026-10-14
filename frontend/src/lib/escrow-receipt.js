import { decodeEventLog, parseAbiItem } from 'viem';

const jobCreated = parseAbiItem('event JobCreated(uint256 indexed jobId, address indexed client, address indexed evaluator, address provider, address hook, uint256 expiredAt)');
const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function requireSuccessfulReceipt(receipt, label) {
  if (receipt.status !== 'success') throw new Error(`${label} transaction reverted. No further transaction was sent.`);
  return receipt;
}

export function createdJobFromReceipt(receipt, expected) {
  requireSuccessfulReceipt(receipt, 'createJob');
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, expected.core)) continue;
    let decoded;
    try { decoded = decodeEventLog({ abi: [jobCreated], data: log.data, topics: log.topics }); }
    catch { continue; }
    const args = decoded.args;
    if (sameAddress(args.client, expected.client) && sameAddress(args.provider, expected.provider)
      && sameAddress(args.evaluator, expected.evaluator) && sameAddress(args.hook, expected.hook)
      && args.expiredAt === BigInt(expected.expiredAt)) return args.jobId;
  }
  throw new Error('The confirmed transaction has no matching escrow job. No deposit was sent.');
}
