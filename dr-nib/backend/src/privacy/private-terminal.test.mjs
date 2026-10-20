import test from 'node:test';import assert from 'node:assert/strict';
import {validateTerminalInput,terminalSpec}from'../../../private-terminal/policy.mjs';
import {preparePrivateTerminal,savePrivateTerminalArtifacts}from'./private-terminal-workflow.js';
const publicRequest={tool:'http_request',url:'https://public.example.com/data',method:'GET',maxMicroUsd:0};
test('terminal jobs reject host paths, service environment and caller-supplied network results',async()=>{
 for(const input of [{command:'true',files:{'../secret':'x'}},{command:'true',files:{'/etc/passwd':'x'}},{command:'true',files:{'.terminal/start.sh':'x'}},{command:'true',env:{SECRET:'x'}},{command:'true',persist:['a/../../secret']},{command:'true',files:{'data.csv':'x'.repeat(262145)}}])assert.throws(()=>validateTerminalInput(input),/PRIVATE_TERMINAL_INPUT_INVALID/);
 await assert.rejects(preparePrivateTerminal({input:{command:'true',publicResponses:[]},state:{brief:{liveWeb:true}}}),/PRIVATE_TERMINAL_INPUT_INVALID/);
 const spec=terminalSpec({rootfs:'/fixed/root',work:'/fixed/job/work',command:'cat /etc/passwd'});
 assert.deepEqual(spec.process.capabilities.bounding,[]);assert.equal(spec.process.noNewPrivileges,true);assert.equal(spec.root.readonly,true);assert.ok(spec.linux.namespaces.some(n=>n.type==='network'));assert.deepEqual(spec.process.args,['/bin/bash','/work/.terminal/start.sh']);
 assert.ok(spec.mounts.every(m=>!['/app','/run','/var','/home','/root'].includes(m.destination)));assert.ok(!JSON.stringify(spec).includes('docker.sock'));
});
test('terminal networking uses exact approved real HTTP tool results, never a terminal-held payment key',async()=>{
 let called=0;const state={brief:{liveWeb:true},events:[],terminalFiles:{'prior.txt':'saved encrypted project artifact'}};
 const prepared=await preparePrivateTerminal({input:{command:'curl https://public.example.com/data',files:{'data.csv':'126,98'},persist:['result.txt'],requests:[publicRequest]},state,ownerQuestion:async q=>{assert.deepEqual(q.externalRequest,publicRequest);return {optionId:'approve'}},externalTool:async({request})=>{called++;assert.deepEqual(request,publicRequest);return {ok:true,callId:'synthetic-finalized',costMicroUsd:0,output:{url:request.url,status:200,text:'Real response transport fixture',truncated:false}}}});
 assert.equal(called,1);assert.equal(prepared.input.publicResponses[0].text,'Real response transport fixture');assert.equal(prepared.input.files['prior.txt'],state.terminalFiles['prior.txt']);assert.equal(prepared.publicSources[0].evidenceKind,'owner-approved-terminal-input');
 const declined=await preparePrivateTerminal({input:{command:'true',requests:[publicRequest]},state,ownerQuestion:async()=>({optionId:'decline'}),externalTool:async()=>assert.fail('No request after decline')});assert.equal(declined.declined,true);
 await assert.rejects(preparePrivateTerminal({input:{command:'true',requests:[publicRequest]},state:{brief:{liveWeb:false}}}),/PRIVATE_TOOL_DISCLOSURE_REQUIRED/);
});
test('only bounded text artifacts persist and chat receives metadata instead of duplicated file bodies',()=>{
 const state={terminalFiles:{'old.txt':'previous'}};
 const shown=savePrivateTerminalArtifacts(state,{artifacts:{'answer.txt':'28'},stdout:'28',stderr:'',exitCode:0});assert.equal(state.terminalFiles['answer.txt'],'28');assert.deepEqual(shown.artifacts,[{path:'answer.txt',bytes:2}]);
 assert.throws(()=>savePrivateTerminalArtifacts(state,{artifacts:{'../../private':'bad'},stdout:'',stderr:''}),/PRIVATE_TERMINAL_INPUT_INVALID/);
});
