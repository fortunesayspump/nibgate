import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLegacyRun,isConfidentialRun,assertConventionalPath} from './guard.js';
test('historical object metadata remains conventional',()=>{
  assert.equal(isLegacyRun({metadata:{}}),true);
  assert.doesNotThrow(()=>assertConventionalPath({metadata:{}}));
  assert.equal(isLegacyRun({metadata:{privacyMode:'legacy'}}),true);
});
test('confidential, unknown and corrupt metadata cannot enter conventional worker',()=>{
  for(const metadata of [{privacyMode:'confidential'},{privacyMode:'future'},null,false,[],undefined]) {
    assert.equal(isLegacyRun({metadata}),false);
    assert.throws(()=>assertConventionalPath({metadata}),{code:'CONFIDENTIAL_BOUNDARY_UNAVAILABLE'});
  }
  assert.equal(isConfidentialRun({metadata:{privacyMode:'confidential'}}),true);
  assert.equal(isConfidentialRun({metadata:{privacyMode:'future'}}),false);
});
