import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMinimizedRoundChoice,privateJevRoute} from './minimized-jev.js';
const fields={decision:'continue_or_write',coverage:'partial',freshness:'mixed',provenance:'verified',contradictions:'absent',verification:'incomplete',remainingWork:'material',withinLimits:true};
test('fixed JEV choice preserves decision-relevant coarse facts but no synthetic source canary',()=>{
  const payload=buildMinimizedRoundChoice(fields);
  assert.deepEqual(JSON.parse(payload.state),fields);
  assert.deepEqual(payload.options.map(x=>x.id),['continue','write']);
  assert.equal(JSON.stringify(payload).includes('HARMLESS_SYNTHETIC_PRIVATE_CANARY'),false);
  assert.throws(()=>{payload.options[0].context='HARMLESS_SYNTHETIC_PRIVATE_CANARY'});
  assert.equal(JSON.stringify(buildMinimizedRoundChoice(fields)).includes('HARMLESS_SYNTHETIC_PRIVATE_CANARY'),false);
});
test('topic, excerpts, findings and arbitrary options cannot be inserted into JEV payload',()=>{
  for(const name of ['topic','excerpt','findings','options','rationale','url'])
    assert.throws(()=>buildMinimizedRoundChoice({...fields,[name]:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}));
});
test('hard runtime or budget cap is local; no JEV continue option can be built',()=>{
  assert.throws(()=>buildMinimizedRoundChoice({...fields,withinLimits:false}),/HARD_LIMIT_LOCAL_WRITE/);
});
test('external route rejects missing verified metadata disclosure, ZDR endpoint or protected hub path',()=>{
  const ok={requiresContent:false,metadataDisclosureApproved:true,attestedAnalysisVerified:true,zeroRetentionEndpointVerified:true,hubPathInsideBoundary:true};
  assert.equal(privateJevRoute(ok),'minimized_external_decision');
  for(const name of ['metadataDisclosureApproved','attestedAnalysisVerified','zeroRetentionEndpointVerified','hubPathInsideBoundary'])
    assert.throws(()=>privateJevRoute({...ok,[name]:false}),/UNAVAILABLE/);
  assert.throws(()=>privateJevRoute({...ok,requiresContent:true}),/UNAVAILABLE/);
  const {requiresContent,...omitted}=ok;
  assert.throws(()=>privateJevRoute(omitted),/UNAVAILABLE/);
  assert.throws(()=>privateJevRoute({...ok,metadataDisclosureApproved:'true'}),/UNAVAILABLE/);
});
