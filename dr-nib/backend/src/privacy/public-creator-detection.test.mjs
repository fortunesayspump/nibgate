import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPublicCreatorDetector} from './public-creator-detection.js';
const page=n=>({url:`https://creator.example/post-${n}`,html:'<article>Original public article.</article>'});
test('failed cold startup resolves every waiting assessment instead of restarting forever',async()=>{
 const workers=[];class Stalled extends EventEmitter{constructor(){super();workers.push(this);}terminate(){return Promise.resolve(1)}unref(){}ref(){}}
 const assess=createPublicCreatorDetector({WorkerClass:Stalled,startupMs:10,parseMs:10});
 const results=await Promise.all([assess(page(1)),assess(page(2))]);assert.equal(workers.length,1);assert.ok(results.every(r=>r.unavailable&&r.reason==='startup-timeout'));
});
test('cold initialization and parsing have separate bounds; repeated pages share one assessment',async()=>{
 let workers=0,parses=0;class Slow extends EventEmitter{constructor(){super();workers++;setTimeout(()=>this.emit('message',{ready:true}),15)}terminate(){return Promise.resolve(1)}unref(){}ref(){}postMessage(){parses++;setTimeout(()=>this.emit('message',{eligible:true,kind:'content',source:'extension-page-model'}),15)}}
 const assess=createPublicCreatorDetector({WorkerClass:Slow,startupMs:100,parseMs:100});const results=await Promise.all([assess(page(1)),assess(page(1))]);assert.ok(results.every(r=>r.eligible));assert.equal(workers,1);assert.equal(parses,1);
});
test('a hung parser stays ineligible and the next assessment can create a clean worker',async()=>{
 let workers=0;class Hung extends EventEmitter{constructor(){super();workers++;setImmediate(()=>this.emit('message',{ready:true}))}terminate(){return Promise.resolve(1)}unref(){}ref(){}postMessage(){}}
 const assess=createPublicCreatorDetector({WorkerClass:Hung,startupMs:100,parseMs:10});for(const n of [1,2]){const result=await assess(page(n));assert.equal(result.reason,'parse-timeout');assert.equal(result.eligible,false);}assert.equal(workers,2);
});
