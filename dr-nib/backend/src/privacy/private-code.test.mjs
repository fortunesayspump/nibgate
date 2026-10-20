import test from 'node:test';import assert from 'node:assert/strict';
import {runPrivateCode} from './private-code.js';
test('private code calculates inside a disposable interpreter using only JSON input',async()=>{
 const out=await runPrivateCode({code:'const mean=data.reduce((a,b)=>a+b,0)/data.length;return {mean,range:Math.max(...data)-Math.min(...data)};',data:[2,4,6]});
 assert.deepEqual(out.result,{mean:4,range:4});assert.equal(out.network,false);assert.equal(out.runtime,'quickjs-wasm');
 await runPrivateCode({code:'globalThis.previousRun="SYNTHETIC_CANARY";return true'});
 assert.equal((await runPrivateCode({code:'return typeof previousRun'})).result,'undefined');
});
test('model code cannot reach Node, secrets, files, network or module loaders',async()=>{
 const out=await runPrivateCode({code:'return [typeof process,typeof require,typeof fetch,typeof std,typeof os,typeof WebSocket,typeof Buffer,typeof Deno]'});
 assert.deepEqual(out.result,Array(8).fill('undefined'));
 await assert.rejects(runPrivateCode({code:'return (function(){}).constructor("return process.env")()'}),/PRIVATE_CODE_FAILED/);
 await assert.rejects(runPrivateCode({code:'return require("node:fs").readFileSync("/etc/passwd")'}),/PRIVATE_CODE_FAILED/);
 await assert.rejects(runPrivateCode({command:'cat /etc/passwd'}),/PRIVATE_CODE_INPUT_INVALID/);
 await assert.rejects(runPrivateCode({language:'python',code:'print(1)'}),/PRIVATE_CODE_INPUT_INVALID/);
});
test('infinite loops and oversized outputs terminate without blocking the research process',async()=>{
 await assert.rejects(runPrivateCode({code:'while(true){}'}),/PRIVATE_CODE_TIMEOUT/);
 await assert.rejects(runPrivateCode({code:'return "x".repeat(50000)'}),/PRIVATE_CODE_FAILED/);
 assert.equal((await runPrivateCode({code:'return 126-98'})).result,28);
});
