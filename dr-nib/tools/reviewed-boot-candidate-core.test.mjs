import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewedBootCandidate, REVIEWED_VERIFIER_IMAGE} from './reviewed-boot-candidate-core.mjs';

// Synthetic policy/claim fixtures only. These cannot pass real Intel DCAP QVL
// and must never be used as release measurements or deployment settings.
const nowMs = 1_800_000_000_000;
const hex = (byte,count) => byte.repeat(count);
function fixture() {
  const report = {
    mrTd:Uint8Array.from({length:48},()=>1),
    mrConfigId:Uint8Array.from({length:48},()=>2),
    mrOwner:Uint8Array.from({length:48},()=>3),
    mrOwnerConfig:Uint8Array.from({length:48},()=>4),
    rtMr0:Uint8Array.from({length:48},()=>5),
    rtMr1:Uint8Array.from({length:48},()=>6),
    rtMr2:Uint8Array.from({length:48},()=>7),
    rtMr3:Uint8Array.from({length:48},()=>8),
    tdAttributes:Uint8Array.from({length:8},()=>9),
    xfam:Uint8Array.from({length:8},()=>10),
    reportData:Uint8Array.from(Buffer.from(hex('ab',32)+hex('00',32),'hex')),
  };
  const policy = {
    appId:hex('11',20),instanceId:hex('12',20),composeHash:hex('13',32),
    osHash:hex('14',32),kmsId:hex('15',20),expectedReportData:hex('ab',32)+hex('00',32),
    expiresAtMs:nowMs+60_000,verifierImageDigest:REVIEWED_VERIFIER_IMAGE,
    reviewedReleaseControls:{productionOsImage:true,sshDisabled:true,debugDisabled:true,
      plaintextLogsDisabled:true,imagesDigestPinned:true},
  };
  const verdict = {is_valid:true,reason:null,details:{quote_verified:true,
    event_log_verified:true,os_image_hash_verified:true,acpi_tables_verified:true,
    tee_variant:'dstack-tdx',tcb_status:'UpToDate',advisory_ids:[],
    os_image_is_dev:null,os_image_version:null,
    key_provider:{name:'kms',id:policy.kmsId},report_data:policy.expectedReportData,
    app_info:{app_id:policy.appId,instance_id:policy.instanceId,
      compose_hash:policy.composeHash,os_image_hash:policy.osHash,
      device_id:hex('16',32),mr_system:hex('17',32),mr_aggregated:hex('18',32),
      key_provider_info:Buffer.from(JSON.stringify({name:'kms',id:policy.kmsId})).toString('hex'),
      init_script_hashes:null},boot_info:{teeVariant:'dstack-tdx',
      mrAggregated:hex('18',32),osImageHash:policy.osHash,mrSystem:hex('17',32),
      appId:policy.appId,composeHash:policy.composeHash,instanceId:policy.instanceId,
      deviceId:hex('16',32),keyProviderInfo:Buffer.from(JSON.stringify({name:'kms',id:policy.kmsId})).toString('hex'),
      tcbStatus:'UpToDate',advisoryIds:[]}}};
  const qvlResult = {status:'UpToDate',advisory_ids:[],report:{type:'td10',asTd10:()=>report}};
  return {attestationBytes:Buffer.from('synthetic invalid evidence'),
    verdictBytes:Buffer.from(JSON.stringify(verdict)),policy,qvlResult,nowMs,verdict,report};
}
function candidate(f) { return buildReviewedBootCandidate(f); }
function reencode(f) { f.verdictBytes=Buffer.from(JSON.stringify(f.verdict)); return f; }

test('clearly synthetic matching policy produces only a candidate',()=>{
  const f=fixture(), result=candidate(f);
  assert.equal(result.status,'candidate-requires-independent-review');
  assert.equal(result.manifest.measurements.rtMr3,hex('08',48));
  assert.equal(result.manifest.audit.verifierImageDigest,REVIEWED_VERIFIER_IMAGE);
  assert.equal(Buffer.from(result.payloadBase64,'base64').toString('utf8'),JSON.stringify(result.manifest));
  assert.match(result.reviewedSha256Hex,/^[0-9a-f]{64}$/);
});
test('rejects absent, expired, or unapproved independent policy',()=>{
  const f=fixture(); delete f.policy.appId;
  assert.throws(()=>candidate(f),/policy/);
  const g=fixture();g.policy.expiresAtMs=nowMs;
  assert.throws(()=>candidate(g),/policy/);
  const h=fixture();h.policy.reviewedReleaseControls.sshDisabled=false;
  assert.throws(()=>candidate(h),/release controls/);
  const i=fixture();i.policy.verifierImageDigest='sha256:'+hex('00',32);
  assert.throws(()=>candidate(i),/policy/);
});
test('rejects a full-verifier verdict without every required check',()=>{
  for(const field of ['quote_verified','event_log_verified','os_image_hash_verified','acpi_tables_verified']) {
    const f=fixture();f.verdict.details[field]=false;
    assert.throws(()=>candidate(reencode(f)),/Full-verifier/,field);
  }
  const t=fixture();t.verdict.details.tcb_status='OutOfDate';
  assert.throws(()=>candidate(reencode(t)),/Full-verifier/);
  const a=fixture();a.verdict.details.advisory_ids=['INTEL-SA-SYNTHETIC'];
  assert.throws(()=>candidate(reencode(a)),/Full-verifier/);
  const d=fixture();d.verdict.details.os_image_is_dev=true;
  assert.throws(()=>candidate(reencode(d)),/Full-verifier/);
});
test('rejects mismatch of independently pinned identities and report_data',()=>{
  for(const field of ['app_id','instance_id','compose_hash','os_image_hash']) {
    const f=fixture();f.verdict.details.app_info[field]=hex('ff',20);
    assert.throws(()=>candidate(reencode(f)),/Full-verifier/,field);
  }
  const k=fixture();k.verdict.details.key_provider.id=hex('ff',20);
  assert.throws(()=>candidate(reencode(k)),/Full-verifier/);
  const r=fixture();r.verdict.details.report_data=hex('ee',64);
  assert.throws(()=>candidate(reencode(r)),/Full-verifier/);
});
test('rejects QVL stale TCB, malformed signed measurement, and changed challenge',()=>{
  const t=fixture();t.qvlResult.status='OutOfDate';
  assert.throws(()=>candidate(t),/QVL/);
  const m=fixture();m.report.rtMr3=Uint8Array.from({length:47},()=>255);
  assert.throws(()=>candidate(m),/signed rtMr3 is invalid/);
  const r=fixture();r.report.reportData=Uint8Array.from({length:64},()=>255);
  assert.throws(()=>candidate(r),/reviewer challenge/);
});
