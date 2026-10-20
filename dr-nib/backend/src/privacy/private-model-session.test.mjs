import test from 'node:test';import assert from 'node:assert/strict';
import {privateModelSessionMatches} from './private-model-session.js';
const model='z-ai/glm-5.3-flash';
function fixture(){return{verifier_id:'private-ai-verifier/armet-ai/v1',endpoint:'https://ctf.armet.ai',channel_binding:[{origin:'https://ctf.armet.ai',type:'tls_spki_sha256',spki_sha256:'a'.repeat(64)}],evidence:{digest:'sha256:'+'b'.repeat(64)},claims:{extra:{canonical_model_id:'GLM-5.3-Flash',accepted_subject:'tdx-measurement:sha256:f43c310e47b36bf4ae30cd55c5b3d05f807a7a5658e057f6ae18b0c12e9f30a5',trust_boundary:'armet-ai-td',evidence_scope:'model_instance',model_id_from_report_data:true,report_data_nonce_matched:true,tls_spki_from_report_data:true,gpu_evidence_from_report_data:true,gpu_verified:true,tcb_status:'UpToDate',tdx_debug_mode:false},...Object.fromEntries(['tee_attested','gpu_attested','serving_software_known_good','tcb_up_to_date'].map(k=>[k,{status:'asserted'}]))}}}
test('exact reviewed hardware-bound GLM name translates only to Flash',()=>{
 assert.equal(privateModelSessionMatches(fixture(),model),true);
 for(const other of ['z-ai/glm-5.3','openai/gpt-oss-120b'])assert.equal(privateModelSessionMatches(fixture(),other),false);
});
test('alias does not admit unknown hardware, router scope, missing model binding or an unpinned measurement',()=>{
 for(const [key,value] of [['accepted_subject','unreviewed'],['evidence_scope','router'],['model_id_from_report_data',false],['report_data_nonce_matched',false],['tls_spki_from_report_data',false],['gpu_evidence_from_report_data',false],['gpu_verified',false],['tcb_status','OutOfDate'],['tdx_debug_mode',true]]){
  const s=fixture();s.claims.extra[key]=value;assert.equal(privateModelSessionMatches(s,model),false,key);
 }
 for(const key of ['tee_attested','gpu_attested','serving_software_known_good','tcb_up_to_date']){const s=fixture();s.claims[key].status='unknown';assert.equal(privateModelSessionMatches(s,model),false,key)}
 const s=fixture();s.verifier_id='unknown';assert.equal(privateModelSessionMatches(s,model),false);
 const t=fixture();t.channel_binding=[];assert.equal(privateModelSessionMatches(t,model),false);
});
test('existing exact canonical sessions retain their original matching behavior',()=>{
 assert.equal(privateModelSessionMatches({claims:{extra:{canonical_model_id:'qwen/qwen3.8-27b'}}},'qwen/qwen3.8-27b'),true);
 assert.equal(privateModelSessionMatches({},model),false);
});
