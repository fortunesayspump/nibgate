#!/usr/bin/env node
// Reviewer workstation only. This emits a CANDIDATE manifest, never an
// automatic approval. Run from a pinned local checkout with installed locked
// frontend dependencies and genuine CVM evidence.
import {readFile} from 'node:fs/promises';
import {decode as decodeMessagePack} from '@msgpack/msgpack';
import {getCollateral, PHALA_PCCS_URL, QuoteVerifier} from '@phala/dcap-qvl';
import {phalaSessionReportData} from '../../dr-nib/backend/src/privacy/phala-verifier.js';
import {buildReviewedBootCandidate, validateApprovedBootPolicy} from
  '../../dr-nib/tools/reviewed-boot-candidate-core.mjs';

const HEX = /^(?:[0-9a-f]{2})+$/i;
function fail(message) { throw new Error(message); }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}
async function boundedRead(path, maxBytes) {
  const contents = await readFile(path);
  if (!contents.length || contents.length > maxBytes) fail(`Invalid review input size: ${path}`);
  return contents;
}
function parseJson(bytes, name) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { fail(`Invalid ${name} JSON`); }
}
function msgpackBytes(value, maxBytes) {
  if (value instanceof Uint8Array && value.length && value.length <= maxBytes) return value;
  if (Array.isArray(value) && value.length && value.length <= maxBytes &&
      value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return Uint8Array.from(value);
  fail('Invalid V1 attestation byte field');
}
function exactTdxQuote(attestationBytes, expectedReportData) {
  let evidence;
  try { evidence = decodeMessagePack(attestationBytes); }
  catch { fail('The attestation is not dstack V1 MessagePack'); }
  if (!exactKeys(evidence,['version','platform','stack']) || evidence.version !== 1 ||
      !exactKeys(evidence.platform,['kind','data']) || evidence.platform.kind !== 'tdx' ||
      !exactKeys(evidence.platform.data,['quote','event_log']) ||
      !exactKeys(evidence.stack,['kind','data']) || evidence.stack.kind !== 'dstack' ||
      !exactKeys(evidence.stack.data,['report_data','runtime_events','config']))
    fail('The attestation is not supported dstack V1 TDX evidence');
  const quote = msgpackBytes(evidence.platform.data.quote, 256 * 1024);
  const stackReportData = msgpackBytes(evidence.stack.data.report_data, 64);
  if (stackReportData.length !== 64 ||
      Buffer.from(stackReportData).toString('hex') !== expectedReportData.toLowerCase())
    fail('V1 stack report_data differs from independent reviewer challenge');
  return quote;
}
function argumentsByName(args) {
  if (args.length !== 10) fail('Usage: node frontend/scripts/build-reviewed-boot-candidate.mjs --session-json review/session.json --nonce-file review/nonce.hex --attestation-json review/attest.json --verdict review/verdict.json --policy review/approved-policy.json');
  const options = {};
  for (let i=0;i<args.length;i+=2) {
    if (!['--session-json','--nonce-file','--attestation-json','--verdict','--policy'].includes(args[i]) ||
        options[args[i]] || !args[i+1]) fail('Invalid reviewer command arguments');
    options[args[i]] = args[i+1];
  }
  if (Object.keys(options).length !== 5) fail('Missing reviewer command arguments');
  return options;
}

async function main() {
  const options = argumentsByName(process.argv.slice(2));
  const [sessionBytes,nonceBytes,attestationJsonBytes,verdictBytes,policyBytes] = await Promise.all([
    boundedRead(options['--session-json'],8 * 1024 * 1024),
    boundedRead(options['--nonce-file'],80),
    boundedRead(options['--attestation-json'],8 * 1024 * 1024),
    boundedRead(options['--verdict'],1024 * 1024),
    boundedRead(options['--policy'],16 * 1024),
  ]);
  const policy = validateApprovedBootPolicy(parseJson(policyBytes,'policy'),Date.now());
  const nonceHex = nonceBytes.toString('ascii').trim();
  if (!/^[0-9a-f]{64}$/.test(nonceHex)) fail('Invalid independent reviewer nonce file');
  const session = parseJson(sessionBytes,'reviewer session');
  if (session.clientNonce !== nonceHex || typeof session.sessionId !== 'string' ||
      typeof session.recipientPublicKey !== 'string' ||
      !exactKeys(session.evidence,['attestation']))
    fail('Reviewer session does not match the independent nonce');
  const recipientPublicKey = Buffer.from(session.recipientPublicKey,'base64');
  if (recipientPublicKey.length !== 65 || recipientPublicKey[0] !== 4 ||
      recipientPublicKey.toString('base64') !== session.recipientPublicKey)
    fail('Invalid reviewer session recipient public key');
  const expectedReportData = Buffer.concat([phalaSessionReportData({
    clientNonce:Buffer.from(nonceHex,'hex'),sessionId:session.sessionId,
    recipientPublicKey}),Buffer.alloc(32)]).toString('hex');
  if (policy.expectedReportData.toLowerCase() !== expectedReportData)
    fail('Approved policy does not match the independently computed reviewer challenge');
  const request = parseJson(attestationJsonBytes,'attestation request');
  if (!exactKeys(request,['attestation']) || typeof request.attestation !== 'string' ||
      !HEX.test(request.attestation) || request.attestation.length > 8 * 1024 * 1024)
    fail('The reviewer input must contain only exact V1 attestation hex');
  if (request.attestation !== session.evidence.attestation)
    fail('Full-verifier input differs from the reviewer session evidence');
  const attestationBytes = Buffer.from(request.attestation,'hex');
  const quote = exactTdxQuote(attestationBytes,policy.expectedReportData);
  // Collateral comes from Phala PCCS for availability. Production QVL checks
  // Intel signatures, chain, CRLs and validity against the local clock.
  const collateral = await getCollateral(PHALA_PCCS_URL, quote);
  const qvlResult = QuoteVerifier.newProd().allowDebug(false).allowServiceTd(false)
    .verify(quote,collateral,Math.floor(Date.now()/1000));
  const candidate = buildReviewedBootCandidate({attestationBytes,verdictBytes,
    policy,qvlResult,nowMs:Date.now()});
  process.stdout.write(`${JSON.stringify(candidate,null,2)}\n`);
}

main().catch(error => { console.error(`Candidate rejected: ${error.message}`); process.exitCode = 1; });
