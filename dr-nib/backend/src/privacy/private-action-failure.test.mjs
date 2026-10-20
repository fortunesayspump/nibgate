import test from 'node:test';
import assert from 'node:assert/strict';
import { privateActionFailure } from './private-action-failure.js';
test('private failure diagnostics accept only fixed allowlisted categories', () => {
    assert.deepEqual(privateActionFailure(Error('PRIVATE_INTAKE_INVALID')), {error:'PRIVATE_INTAKE_INVALID'});
    assert.deepEqual(privateActionFailure({code:'PHALA_PRIVATE_AI_UNAVAILABLE',message:'secret prompt'}), {error:'PHALA_PRIVATE_AI_UNAVAILABLE'});
    for (const error of [Error('secret prompt'), Error('PRIVATE_SECRET_source_text'), null, {code:'PRIVATE_SECRET'}])
        assert.deepEqual(privateActionFailure(error), {error:'PRIVATE_ACTION_UNAVAILABLE'});
});
test('private AI phases are reduced to fixed codes and never contain exception text',()=>{
    for(const stage of ['request','attestation','session','completion','receipt'])assert.deepEqual(privateActionFailure({code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:stage,message:'SECRET_PROVIDER_BODY'}),{error:`PHALA_PRIVATE_AI_${stage.toUpperCase()}_FAILED`});
    assert.deepEqual(privateActionFailure({code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'SECRET_PROVIDER_BODY'}),{error:'PHALA_PRIVATE_AI_UNAVAILABLE'});
});
test('only fixed internal completion categories enter encrypted diagnostics',()=>{
 for(const code of ['PHALA_PRIVATE_AI_SESSION_EXPIRED','PHALA_PRIVATE_AI_REQUEST_REJECTED','PHALA_PRIVATE_AI_CREDENTIAL_REJECTED','PHALA_PRIVATE_AI_RATE_LIMITED','PHALA_PRIVATE_AI_UPSTREAM_UNAVAILABLE']){
  assert.deepEqual(privateActionFailure({code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'completion',privateCompletionReason:code,message:'SECRET_PROVIDER_BODY'}),{error:code});
  assert.deepEqual(privateActionFailure(Error(code)),{error:code});
 }
 assert.deepEqual(privateActionFailure({code:'PHALA_PRIVATE_AI_UNAVAILABLE',failureStage:'completion',privateCompletionReason:'SECRET_PROVIDER_BODY'}),{error:'PHALA_PRIVATE_AI_COMPLETION_FAILED'});
});

test('transaction timeouts expose a fixed recovery category without database or research text',()=>{
 assert.deepEqual(privateActionFailure({code:'P2028',message:'private document and database connection details'}),{error:'PRIVATE_STORAGE_TRANSACTION_TIMEOUT'});
});
