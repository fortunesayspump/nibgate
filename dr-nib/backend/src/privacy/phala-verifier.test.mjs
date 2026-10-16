import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPinnedDstackVerifier, phalaSessionReportData, verifyPhalaRecipient } from './phala-verifier.js';

// Synthetic verdicts exercise policy logic only; they are NOT real attestation.
const nonce = Buffer.alloc(32, 0x23);
const sessionId = 'd0d79704-ea1e-433e-8485-18deea67ee22';
const key = Uint8Array.from([4, ...Buffer.alloc(64, 0x43)]);
const recipientId = createHash('sha256').update(key).digest('hex');
const composeHash = '11'.repeat(32);
const osHash = '22'.repeat(32);
const kmsId = '33'.repeat(32);
const appId = '44'.repeat(20);
const instanceId = '55'.repeat(20);
const evidence = { attestation: 'aabbccdd' };
const controls = { sshDisabled: true, debugDisabled: true, plaintextLogsDisabled: true, imagesDigestPinned: true, productionOsImage: true };
const report = Buffer.concat([phalaSessionReportData({ clientNonce: nonce, sessionId, recipientPublicKey: key }), Buffer.alloc(32)]).toString('hex');
function syntheticVerdict() {
  return {
    is_valid: true,
    details: {
      quote_verified: true, event_log_verified: true, os_image_hash_verified: true,
      acpi_tables_verified: true, os_image_is_dev: false, tee_variant: 'dstack-tdx',
      tcb_status: 'UpToDate', advisory_ids: [], report_data: report,
      key_provider: { name: 'kms', id: kmsId },
      app_info: { app_id: appId, instance_id: instanceId, compose_hash: composeHash, os_image_hash: osHash },
    },
  };
}
function input(overrides = {}) {
  return {
    evidence, clientNonce: nonce, sessionId, recipientPublicKey: key,
    expectedAppId: appId, expectedComposeHash: composeHash, expectedOsHash: osHash,
    expectedKeyProvider: { name: 'kms', id: kmsId },
    reviewedReleaseControls: controls,
    verifyEvidence: async () => syntheticVerdict(),
    verifyKeyPossession: async () => ({ verified: true, clientNonce: nonce.toString('hex'), sessionId, recipientId }),
    consumeNonce: async () => true,
    ...overrides,
  };
}

test('synthetic full-verifier verdict requires matching release, fresh challenge and live HPKE possession', async () => {
  let payload;
  const result = await verifyPhalaRecipient(input({ verifyEvidence: async value => { payload = value; return syntheticVerdict(); } }));
  assert.deepEqual(payload, { attestation: 'aabbccdd' });
  assert.deepEqual(result, { verified: true, recipientId, sessionId, appId, instanceId: null, composeHash, osHash });
});

test('modern TDX lite OS classification null requires independently reviewed production OS hash', async () => {
  const verdict = syntheticVerdict();
  verdict.details.os_image_is_dev = null;
  await verifyPhalaRecipient(input({ verifyEvidence: async () => verdict }));
  await assert.rejects(verifyPhalaRecipient(input({
    verifyEvidence: async () => verdict,
    reviewedReleaseControls: { ...controls, productionOsImage: false },
  })), /RELEASE_CONTROLS_NOT_APPROVED/);
});

test('quote triplet is passed unchanged to the official dstack verifier contract', async () => {
  let payload;
  await verifyPhalaRecipient(input({
    evidence: { quote: 'aabb', eventLog: '[{"test":"synthetic"}]', vmConfig: '{"test":"synthetic"}' },
    verifyEvidence: async value => { payload = value; return syntheticVerdict(); },
  }));
  assert.deepEqual(payload, { quote: 'aabb', event_log: '[{"test":"synthetic"}]', vm_config: '{"test":"synthetic"}' });
});

test('rejects missing or unreviewed release anchors and controls before contacting verifier', async () => {
  let calls = 0;
  const verifyEvidence = async () => { calls++; return syntheticVerdict(); };
  for (const change of [
    { expectedAppId: undefined }, { expectedComposeHash: undefined }, { expectedOsHash: undefined },
    { expectedKeyProvider: undefined }, { reviewedReleaseControls: undefined },
    { reviewedReleaseControls: { ...controls, plaintextLogsDisabled: false } },
    { evidence: { quote: 'aa', eventLog: '[]' } },
  ]) await assert.rejects(verifyPhalaRecipient(input({ ...change, verifyEvidence })), /MISSING_APPROVED|RELEASE_CONTROLS|INVALID_ATTESTATION/);
  assert.equal(calls, 0);
});

test('rejects any false or unknown hardware, boot, development, TCB or release identity claim', async () => {
  const mutations = [
    v => { v.is_valid = false; },
    v => { v.details.quote_verified = false; },
    v => { delete v.details.quote_verified; },
    v => { v.details.event_log_verified = false; },
    v => { v.details.os_image_hash_verified = false; },
    v => { v.details.acpi_tables_verified = false; },
    v => { v.details.os_image_is_dev = true; },
    v => { delete v.details.os_image_is_dev; },
    v => { v.details.tee_variant = 'dstack-aws-nitro-tpm'; },
    v => { v.details.tcb_status = 'OutOfDate'; },
    v => { v.details.advisory_ids = ['INTEL-SA-SYNTHETIC']; },
    v => { v.details.app_info.compose_hash = '44'.repeat(32); },
    v => { v.details.app_info.app_id = '66'.repeat(20); },
    v => { v.details.app_info.os_image_hash = '44'.repeat(32); },
    v => { v.details.key_provider.id = '44'.repeat(32); },
    v => { v.details.key_provider = null; },
  ];
  for (const mutate of mutations) {
    const verdict = syntheticVerdict();
    mutate(verdict);
    await assert.rejects(verifyPhalaRecipient(input({ verifyEvidence: async () => verdict })), /ATTESTATION_POLICY_REJECTED/);
  }
});

test('optionally pins a controller-authenticated instance identity', async () => {
  const ok = await verifyPhalaRecipient(input({ expectedInstanceId: instanceId }));
  assert.equal(ok.instanceId, instanceId);
  await assert.rejects(verifyPhalaRecipient(input({ expectedInstanceId: '66'.repeat(20) })), /ATTESTATION_POLICY_REJECTED/);
});

test('rejects modified report data, nonce, session identity or recipient key', async () => {
  for (const change of [
    { clientNonce: Buffer.alloc(32, 0x24) },
    { sessionId: 'e0d79704-ea1e-433e-8485-18deea67ee22' },
    { recipientPublicKey: Uint8Array.from([4, ...Buffer.alloc(64, 0x44)]) },
  ]) await assert.rejects(verifyPhalaRecipient(input(change)), /ATTESTATION_SESSION_MISMATCH/);
  const bad = syntheticVerdict();
  bad.details.report_data = report.slice(0, -2) + '01';
  await assert.rejects(verifyPhalaRecipient(input({ verifyEvidence: async () => bad })), /ATTESTATION_SESSION_MISMATCH/);
});

test('rejects missing, failed, wrong-session and stale possession without consuming nonce', async () => {
  let consumed = 0;
  const consumeNonce = async () => { consumed++; return true; };
  for (const verifyKeyPossession of [
    undefined,
    async () => true,
    async () => ({ verified: true, clientNonce: nonce.toString('hex'), sessionId, recipientId: '55'.repeat(32) }),
    async () => ({ verified: true, clientNonce: nonce.toString('hex'), sessionId: 'e0d79704-ea1e-433e-8485-18deea67ee22', recipientId }),
    async () => ({ verified: false, clientNonce: nonce.toString('hex'), sessionId, recipientId }),
  ]) await assert.rejects(verifyPhalaRecipient(input({ verifyKeyPossession, consumeNonce })), /ATTESTATION_DEPENDENCY_MISSING|KEY_POSSESSION_FAILED/);
  assert.equal(consumed, 0);
  await assert.rejects(verifyPhalaRecipient(input({ consumeNonce: async () => false })), /CLIENT_NONCE_NOT_FRESH/);
});

test('pinned verifier transport rejects insecure or unpinned endpoints', () => {
  for (const url of [
    'http://verifier.example/verify', 'https://verifier.example/other',
    'https://user:pass@verifier.example/verify', 'https://verifier.example/verify?skip=true',
  ]) assert.throws(() => createPinnedDstackVerifier({ url, spkiSha256: 'aa'.repeat(32) }), /INVALID_VERIFIER_URL/);
  assert.throws(() => createPinnedDstackVerifier({ url: 'https://verifier.example/verify' }), /INVALID_VERIFIER_PIN/);
});

test('TLS transport validates WebPKI and the SPKI pin on each one-shot connection', t => {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); }
  catch { t.skip('OpenSSL CLI unavailable for ephemeral localhost TLS fixture'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'phala-verifier-tls-'));
  try {
    const cert = join(dir, 'localhost.crt');
    const keyFile = join(dir, 'localhost.key');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', keyFile, '-out', cert, '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost',
      '-addext', 'basicConstraints=critical,CA:TRUE',
    ], { stdio: 'ignore' });
    const moduleUrl = new URL('./phala-verifier.js', import.meta.url).href;
    const child = `
      import { readFileSync } from 'node:fs';
      import { createHash, X509Certificate } from 'node:crypto';
      import { createServer } from 'node:https';
      import { createPinnedDstackVerifier } from ${JSON.stringify(moduleUrl)};
      const cert=readFileSync(${JSON.stringify(cert)}), key=readFileSync(${JSON.stringify(keyFile)});
      const spki=new X509Certificate(cert).publicKey.export({type:'spki',format:'der'});
      const pin=createHash('sha256').update(spki).digest('hex');
      const server=createServer({cert,key},(req,res)=>{req.resume();res.writeHead(200,{'content-type':'application/json'});res.end('{"is_valid":false}');});
      await new Promise(r=>server.listen(0,'127.0.0.1',r));
      const url='https://localhost:'+server.address().port+'/verify';
      try {
        const good=createPinnedDstackVerifier({url,spkiSha256:pin});
        if((await good.verifyEvidence({attestation:'aa'})).is_valid!==false)throw new Error('valid pin failed');
        if((await good.verifyEvidence({attestation:'aa'})).is_valid!==false)throw new Error('second valid pin failed');
        const bad=createPinnedDstackVerifier({url,spkiSha256:'00'.repeat(32)});
        let rejected=false;
        try {await bad.verifyEvidence({attestation:'aa'});}catch{rejected=true;}
        if(!rejected)throw new Error('wrong pin bypassed');
        const wrongHost=createPinnedDstackVerifier({url:'https://127.0.0.1:'+server.address().port+'/verify',spkiSha256:pin});
        rejected=false;
        try {await wrongHost.verifyEvidence({attestation:'aa'});}catch{rejected=true;}
        if(!rejected)throw new Error('hostname check bypassed');
      } finally {await new Promise(r=>server.close(r));}
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
      env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
