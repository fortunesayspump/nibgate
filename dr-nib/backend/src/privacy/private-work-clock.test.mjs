import test from 'node:test';import assert from 'node:assert/strict';
import{createPrivateWorkClock}from'./private-work-clock.js';
test('work clock excludes owner wait, paused time and offline crash gaps across recovery',()=>{
 let mono=100,wall=1000000;
 const make=prior=>createPrivateWorkClock({prior,monotonicNow:()=>mono,wallNow:()=>wall});
 const first=make();mono+=1234;const paused=first.stop();assert.equal(paused.durationMs,1234);assert.equal(paused.running,false);
 mono+=86400000;wall+=86400000;assert.equal(first.snapshot().durationMs,1234);
 const resumed=make(paused);mono+=2000;const checkpoint=resumed.snapshot(false);assert.equal(checkpoint.durationMs,3234);
 mono+=3600000;wall+=3600000;const recovered=make(checkpoint);mono+=3000;
 assert.equal(recovered.stop().durationMs,6234);mono+=999999;assert.equal(recovered.snapshot().durationMs,6234);
});
test('wall-clock changes cannot inflate duration; legacy runs start recording without inventing history',()=>{
 let mono=0,wall=100000;const clock=createPrivateWorkClock({prior:{durationMs:100000},monotonicNow:()=>mono,wallNow:()=>wall});
 mono=700;wall+=86400000;assert.equal(clock.snapshot().durationMs,700);wall=0;assert.equal(clock.snapshot().durationMs,700);
});
