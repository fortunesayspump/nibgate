import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchSubmissionController,isResearchSignInRequired} from '../frontend/src/lib/dr-nib-signin-submission.ts';
const unauthorized=()=>Object.assign(new Error('test-only expired session'),{status:401});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(overrides={}) {
 const events=[];
 return {events,flow:{checkSession:async()=>events.push('check'),authenticate:async()=>{events.push('auth');return true;},submit:async()=>{events.push('submit');return 'result';},onSubmitting:()=>events.push('submitting'),onSuccess:v=>events.push(v),onAuthRequired:()=>events.push('required'),onError:e=>events.push(e),...overrides}};
}
test('recognizes private status 401 and ordinary auth code, not outages/403',()=>{
 assert.equal(isResearchSignInRequired({status:401}),true);assert.equal(isResearchSignInRequired({code:'unauthenticated'}),true);
 for(const e of [null,undefined,{status:403},{status:503},new Error('401')])assert.equal(isResearchSignInRequired(e),false);
});
test('signed-in session submits once without opening auth',async()=>{
 const {flow,events}=fixture();await createResearchSubmissionController().run(flow);
 assert.deepEqual(events,['check','submitting','submit','result']);
});
test('fresh visitor authenticates and rechecks before exactly one submission',async()=>{
 let checks=0;const {flow,events}=fixture({checkSession:async()=>{if(++checks===1)throw unauthorized();}});
 await createResearchSubmissionController().run(flow);assert.equal(checks,2);assert.deepEqual(events,['required','auth','submitting','submit','result']);
});
test('cancelled dialog never submits and next explicit attempt remains possible',async()=>{
 const controller=createResearchSubmissionController();const {flow,events}=fixture({checkSession:async()=>{throw unauthorized();},authenticate:async()=>false});
 await controller.run(flow);assert.deepEqual(events,['required']);assert.equal(controller.running,false);
 const next=fixture();await controller.run(next.flow);assert.ok(next.events.includes('submit'));
});
test('second 401 stops without reopening or submitting',async()=>{
 const error=unauthorized();const {flow,events}=fixture({checkSession:async()=>{throw error;}});
 await createResearchSubmissionController().run(flow);assert.deepEqual(events,['required','auth',error]);
});
test('simultaneous repeated Send uses synchronous single flight',async()=>{
 const wait=deferred();const {flow,events}=fixture({checkSession:()=>wait.promise});const controller=createResearchSubmissionController();
 const first=controller.run(flow);assert.equal(controller.running,true);await controller.run(flow);wait.resolve();await first;
 assert.equal(events.filter(x=>x==='submit').length,1);
});
test('edit while authentication is open invalidates the old question',async()=>{
 const wait=deferred();const controller=createResearchSubmissionController();const {flow,events}=fixture({checkSession:async()=>{throw unauthorized();},authenticate:()=>wait.promise});
 const first=controller.run(flow);await Promise.resolve();controller.invalidate();wait.resolve(true);await first;
 assert.deepEqual(events,['required']);
});
test('unmount during preflight prevents dialog and mutation',async()=>{
 const wait=deferred();const controller=createResearchSubmissionController();const {flow,events}=fixture({checkSession:()=>wait.promise});
 const first=controller.run(flow);controller.invalidate();wait.resolve();await first;assert.deepEqual(events,[]);
});
test('newer navigation discards a late mutation response, never replays mutation',async()=>{
 const wait=deferred();const controller=createResearchSubmissionController();const {flow,events}=fixture({submit:()=>{events.push('submit');return wait.promise;}});
 const first=controller.run(flow);await Promise.resolve();controller.invalidate();wait.resolve('late');await first;
 assert.deepEqual(events,['check','submitting','submit']);
});
test('mutation 401 surfaces actionable failure without retrying uncertain operation',async()=>{
 const error=unauthorized();const {flow,events}=fixture({submit:async()=>{events.push('submit');throw error;}});
 await createResearchSubmissionController().run(flow);assert.deepEqual(events,['check','submitting','submit',error]);
});
test('503 and other session errors do not trigger auth',async()=>{
 const error=Object.assign(new Error('test-only unavailable'),{status:503});const {flow,events}=fixture({checkSession:async()=>{throw error;}});
 await createResearchSubmissionController().run(flow);assert.deepEqual(events,[error]);
});
test('retry with a now-valid session does not unnecessarily sign again',async()=>{
 const {flow,events}=fixture();await createResearchSubmissionController().run(flow);
 assert.deepEqual(events,['check','submitting','submit','result']);
});
test('rejected auth promise is recoverable and never submits',async()=>{
 const error=new Error('test-only cancellation');const controller=createResearchSubmissionController();const {flow,events}=fixture({checkSession:async()=>{throw unauthorized();},authenticate:async()=>{throw error;}});
 await controller.run(flow);assert.deepEqual(events,['required',error]);assert.equal(controller.running,false);
});
