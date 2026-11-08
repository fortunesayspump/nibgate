import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {createPrivateCheckpoint,answerPrivateCheckpoint} from './private-checkpoint.js';
import {PRIVATE_USAGE,PRIVATE_METERED_COST,PRIVATE_NOT_DISPATCHED} from './phala-ai-port.js';
const initial=()=>({format:'drnib-checkpoint-v1',entries:[],consumed:[]});
test('completed operations replay exact results and receipt evidence without provider dispatch',async()=>{
 const key=randomBytes(32);let stored,calls=0;
 const make=value=>createPrivateCheckpoint({key,value,save:async v=>{stored=JSON.parse(JSON.stringify(v))},fence:async()=>{}});
 const result={choices:[{message:{content:'observed result'}}]};Object.defineProperty(result,PRIVATE_USAGE,{value:{inputTokens:4,outputTokens:2}});Object.defineProperty(result,PRIVATE_METERED_COST,{value:7});
 await make(initial()).operation('infer',{stage:'write',messages:[{role:'user',content:'SYNTHETIC_PRIVATE_CANARY'}]},async()=>{calls++;return result});
 assert.ok(!JSON.stringify(stored).includes('SYNTHETIC_PRIVATE_CANARY'));
 const replay=await make(stored).operation('infer',{stage:'write',messages:[{role:'user',content:'SYNTHETIC_PRIVATE_CANARY'}]},()=>assert.fail('must not infer again'));
 assert.deepEqual(replay.choices,result.choices);assert.equal(replay[PRIVATE_METERED_COST],7);assert.deepEqual(replay[PRIVATE_USAGE],result[PRIVATE_USAGE]);assert.equal(calls,1);
 await assert.rejects(make(stored).operation('infer',{stage:'write',messages:[{role:'user',content:'changed request'}]},()=>assert.fail('mismatch cannot dispatch')),/PRIVATE_CHECKPOINT_UNCERTAIN/);
});
test('the response/cache crash gap is uncertain and never repeats an operation',async()=>{
 const key=randomBytes(32);let stored,writes=0,calls=0;
 const journal=createPrivateCheckpoint({key,value:initial(),fence:async()=>{},save:async v=>{if(++writes===2)throw Error('crash after provider response');stored=JSON.parse(JSON.stringify(v));}});
 await assert.rejects(journal.operation('infer',{stage:'write'},async()=>{calls++;return {answer:'completed but not saved'}}));
 const recovered=createPrivateCheckpoint({key,value:stored,fence:async()=>{},save:async()=>{}});
 await assert.rejects(recovered.operation('infer',{stage:'write'},()=>assert.fail('unknown outcome cannot repeat')),/PRIVATE_CHECKPOINT_UNCERTAIN/);assert.equal(calls,1);
});
test('pause is consumed once and resumes at the next operation, retaining completed work',async()=>{
 const key=randomBytes(32);let stored,paused=false,calls=0;
 const make=value=>createPrivateCheckpoint({key,value,fence:async()=>{},save:async v=>{stored=JSON.parse(JSON.stringify(v))},controls:async()=>paused?[{id:'pause-1',command:'pause'}]:[]});
 const journal=make(initial());await journal.operation('infer',{step:1},async()=>{calls++;return {done:1}});paused=true;
 await assert.rejects(journal.operation('infer',{step:2},()=>assert.fail('pause must precede spending')),/PRIVATE_ACTION_PAUSED/);
 const resumed=make(stored);await resumed.operation('infer',{step:1},()=>assert.fail('finished step must not repeat'));
 assert.deepEqual(await resumed.operation('infer',{step:2},async()=>{calls++;return {done:2}}),{done:2});assert.equal(calls,2);
});
test('guidance affects only newly admitted calls and old workers are fenced even on replay',async()=>{
 const key=randomBytes(32),value=initial();let stored,allow=true;
 const make=v=>createPrivateCheckpoint({key,value:v,save:async data=>{stored=JSON.parse(JSON.stringify(data))},fence:async()=>{if(!allow)throw Error('PRIVATE_CHECKPOINT_FENCED')},controls:async()=>[{id:'guidance',command:'guidance',text:'Explain uncertainty'}]});
 const request={messages:[{role:'user',content:'Research question'}]};
 await make(value).operation('infer',request,async actual=>{assert.equal(actual.messages.at(-1).content,'Owner guidance for remaining work: Explain uncertainty');return {answer:'observed'}});
 allow=false;await assert.rejects(make(stored).operation('infer',request,()=>assert.fail('fenced replay')),/PRIVATE_CHECKPOINT_FENCED/);
});
test('steering arriving during a model call reaches the next JEV and model calls without rewriting or replaying the in-flight result',async()=>{
 const value=initial(),key=randomBytes(32);let controls=[],models=0;
 const journal=createPrivateCheckpoint({key,value,save:async()=>{},fence:async()=>{},controls:async()=>controls});
 const original={messages:[{role:'user',content:'Initial research context'}]};
 await journal.operation('infer',original,async actual=>{
  models++;assert.deepEqual(actual.messages,original.messages);
  controls=[{id:'new-steering',command:'guidance',text:'Use only the corrected public URL and retain the budget.'}];
  return {answer:'Already in-flight response'};
 });
 assert.equal(value.consumed.includes('new-steering'),false);
 await journal.operation('judge',{request:{state:{proposal:'A proposed action'}}},async actual=>{
  assert.equal(actual.request.state.ownerGuidance,controls[0].text);return {decision:'observed'};
 });
 assert.equal(value.consumed.includes('new-steering'),true);
 await journal.operation('infer',original,async actual=>{models++;assert.equal(actual.messages.at(-1).content,'Owner guidance for remaining work: '+controls[0].text);return {answer:'New-context response'};});
 assert.equal(models,2);assert.equal(original.messages.length,1);
});
test('owner questions park durably, accept only the matching answer and restore without paid replay',async()=>{
 const key=randomBytes(32);let stored;
 const make=value=>createPrivateCheckpoint({key,value,fence:async()=>{},save:async v=>{stored=JSON.parse(JSON.stringify(v))}});
 const question={prompt:'Which population is in scope?',options:[{id:'pilot',label:'Fictional pilot only'},{id:'all',label:'All plants'}]};
 await assert.rejects(make(initial()).ownerQuestion(question),error=>error.message==='PRIVATE_ACTION_AWAITING'&&error.question.prompt===question.prompt);
 assert.equal(stored.entries[0].state,'waiting');
 assert.throws(()=>answerPrivateCheckpoint(structuredClone(stored),{questionId:'stale',optionId:'pilot'}),/PRIVATE_ANSWER_INVALID/);
 assert.throws(()=>answerPrivateCheckpoint(structuredClone(stored),{questionId:stored.entries[0].question.id,optionId:'invented'}),/PRIVATE_ANSWER_INVALID/);
 answerPrivateCheckpoint(stored,{questionId:stored.entries[0].question.id,optionId:'pilot'});
 assert.deepEqual(await make(stored).ownerQuestion(question),{optionId:'pilot',label:'Fictional pilot only'});
 assert.throws(()=>answerPrivateCheckpoint(stored,{questionId:stored.entries[0].question.id,text:'second answer'}),/PRIVATE_ANSWER_INVALID/);
});

test('a trusted admission refusal leaves a resumable boundary while unknown failures stay fenced',async()=>{
 for(const notDispatched of [true,false]){
  let saved;const checkpoint=createPrivateCheckpoint({key:randomBytes(32),value:initial(),save:async value=>{saved=structuredClone(value)},fence:async()=>{}});
  const error=Error('PRIVATE_RUN_BUDGET_EXHAUSTED');if(notDispatched)Object.defineProperty(error,PRIVATE_NOT_DISPATCHED,{value:true});else error.privateNotDispatched=true;
  await assert.rejects(checkpoint.operation('infer',{stage:'write'},async()=>{throw error}),/PRIVATE_RUN_BUDGET_EXHAUSTED/);
  assert.equal(saved.entries.length,notDispatched?0:1);
  if(notDispatched)assert.equal(await checkpoint.operation('infer',{stage:'write'},async()=>({answer:'admitted after a budget change'})).then(value=>value.answer),'admitted after a budget change');
  else assert.equal(saved.entries[0].state,'started');
 }
});

test('model acknowledgment is durable, batched and published again on replay without another model call',async()=>{
 const key=randomBytes(32),value=initial();let saved,generated=0,performed=0,published=[];
 const controls=[{id:'a',command:'guidance',text:'Attribute personal experience.'},{id:'b',command:'guidance',text:'Do not buy more sources.'}];
 const make=v=>{const cp=createPrivateCheckpoint({key,value:v,save:async x=>{saved=structuredClone(x)},fence:async()=>{},controls:async()=>controls});cp.setGuidanceAcknowledger({generate:async batch=>{generated++;assert.equal(batch.length,2);return {reply:'I will attribute the experience and use only the existing source.'}},publish:async(result,batch)=>published.push({result,ids:batch.map(c=>c.id)})});return cp;};
 const request={request:{state:{proposal:'write'}}};
 await make(value).operation('judge',request,async actual=>{performed++;assert.match(actual.request.state.ownerGuidance,/Attribute/);return {decision:'write'}});
 await make(saved).operation('judge',request,()=>assert.fail('completed action must not repeat'));
 assert.equal(generated,1);assert.equal(performed,1);assert.equal(published.length,2);assert.deepEqual(published[0],published[1]);
});

test('an uncertain acknowledgment never dispatches the research action or repeats the model',async()=>{
 const key=randomBytes(32);let saved,calls=0;
 const make=v=>{const cp=createPrivateCheckpoint({key,value:v,save:async x=>{saved=structuredClone(x)},fence:async()=>{},controls:async()=>[{id:'a',command:'guidance',text:'Use current evidence.'}]});cp.setGuidanceAcknowledger({generate:async()=>{calls++;throw Error('lost response')},publish:async()=>assert.fail('no fabricated acknowledgment')});return cp;};
 await assert.rejects(make(initial()).operation('infer',{messages:[]},()=>assert.fail('must not dispatch')),/lost response/);
 await assert.rejects(make(saved).operation('infer',{messages:[]},()=>assert.fail('must not replay')),/PRIVATE_CHECKPOINT_UNCERTAIN/);
 assert.equal(calls,1);
});

test('a refused next action retains its already generated acknowledgment for a safe retry',async()=>{
 const key=randomBytes(32);let saved,acks=0;
 const make=v=>{const cp=createPrivateCheckpoint({key,value:v,save:async x=>{saved=structuredClone(x)},fence:async()=>{},controls:async()=>[{id:'a',command:'guidance',text:'Keep the scope.'}]});cp.setGuidanceAcknowledger({generate:async()=>{acks++;return {reply:'I will retain the scope.'}},publish:async()=>{}});return cp;};
 const refusal=Error('not admitted');Object.defineProperty(refusal,PRIVATE_NOT_DISPATCHED,{value:true});
 await assert.rejects(make(initial()).operation('infer',{messages:[]},async()=>{throw refusal}),/not admitted/);
 assert.equal(saved.entries[0].state,'ready');
 assert.deepEqual(await make(saved).operation('infer',{messages:[]},async()=>({answer:'continued'})),{answer:'continued'});assert.equal(acks,1);
});

test('steering during an in-flight action is acknowledged only at the following boundary',async()=>{
 let controls=[],acks=0;const cp=createPrivateCheckpoint({key:randomBytes(32),value:initial(),save:async()=>{},fence:async()=>{},controls:async()=>controls});
 cp.setGuidanceAcknowledger({generate:async()=>{acks++;return {reply:'I will apply the revised scope.'}},publish:async()=>{}});
 await cp.operation('infer',{messages:[]},async()=>{controls=[{id:'a',command:'guidance',text:'Revised scope.'}];assert.equal(acks,0);return {answer:'in flight'}});
 assert.equal(acks,0);await cp.operation('judge',{request:{}},async()=>({decision:'continue'}));assert.equal(acks,1);
});
