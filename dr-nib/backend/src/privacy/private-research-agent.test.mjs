import test from 'node:test';import assert from 'node:assert/strict';
import {runPrivateResearchAgent} from './private-research-agent.js';
const initial=()=>({brief:{topic:'Fictional basil irrigation',depth:'quick',liveWeb:false},plan:{sub_questions:['Compare the observations']},decisions:[],events:[]});
const doc={id:'original',title:'Fictional pilot',provider:'user-upload',text:'126 litres versus 98 litres.',url:'user-upload://original'};
const proposal=tool=>({choices:[{message:{content:JSON.stringify({tool,input:{},why:'Advance the research'})},finish_reason:'stop'}]});
test('new journals read the exact requested URLs first, with JEV and owner approval before each dispatch',async()=>{
 const state=initial(),order=[],urls=['https://example.com/tutorial','https://example.org/reference'];state.brief.topic=urls.join(' and ');state.brief.liveWeb=true;state.brief.searchEnabled=false;
 const out=await runPrivateResearchAgent({state,docs:[],directReadsFirst:true,infer:async()=>{order.push('infer');assert.equal(order.filter(x=>x==='fetch').length,2);return proposal('write_report')},judge:judgeFor(order),progress:async()=>{},ownerQuestion:async request=>{order.push('approval');assert.equal(request.externalRequest.tool,'web_fetch');assert.ok(urls.includes(request.externalRequest.url));return {optionId:'approve'}},externalTool:async({request})=>{assert.equal(order.at(-1),'approval');order.push('fetch');return {ok:true,costMicroUsd:0,callId:request.url,output:{text:'Context manager protocol evidence.'}}}});
 assert.equal(out.length,2);assert.deepEqual(order.slice(0,3),['judge','approval','fetch']);assert.deepEqual(out.map(d=>d.url),urls);
});
test('old proposal order is preserved until the empty-evidence boundary, then exact reads can park for approval',async()=>{
 const state=initial();state.brief.topic='Read https://example.com/article';state.brief.liveWeb=true;state.brief.searchEnabled=false;let calls=0;const order=[];
 await assert.rejects(runPrivateResearchAgent({state,docs:[],infer:async()=>{calls++;return proposal(calls===2?'public_research':'ask_user')},judge:async request=>{const out=await judgeFor(order)(request);if(request.request.state.proposal?.tool==='ask_user')out.answers.gate={type:'choice',choice:'skip',probabilities:{execute:0,skip:1}};return out},progress:async()=>{},ownerQuestion:async request=>{assert.equal(calls,3);assert.equal(request.externalRequest.url,'https://example.com/article');throw Error('SYNTHETIC_APPROVAL_PAUSE')},externalTool:()=>assert.fail('No dispatch without approval')}),{message:'SYNTHETIC_APPROVAL_PAUSE'});
 assert.equal(calls,3);assert.equal(order.length,3);
});
test('private code and round review remain JEV-gated and a useful follow-up continues before writing',async()=>{
 const state=initial(),order=[];let calls=0,reviews=0,codeCalls=0;
 const infer=async()=>{
  calls++;return calls===1?proposal('write_report'):calls===2?{choices:[{message:{content:JSON.stringify({tool:'run_code',input:{code:'return 126-98',data:null},why:'Check the arithmetic gap.'})}}]}:proposal('write_report');
 };
 const judge=async input=>{
  const out=await judgeFor(order)(input);
  if(input.request.questions.next)out.answers.next={type:'choice',choice:'continue',probabilities:{continue:1,write:0}};
  if(input.request.state.proposal)assert.ok(Buffer.byteLength(JSON.stringify(input.request))<12000);
  return out;
 };
 await runPrivateResearchAgent({state,docs:[{...doc}],infer,judge,run:{},actionId:'fixture',progress:async()=>{},reviewRound:async()=>{reviews++;return {learnings:['Water use differs.'],followUps:['Check the subtraction.']}},runCode:async()=>{assert.equal(order.at(-1),'judge');codeCalls++;return {ok:true,result:28}}});
 assert.equal(reviews,1);assert.equal(codeCalls,1);assert.ok(state.events.some(e=>e.type==='round.reviewed'));assert.ok(state.events.some(e=>e.tool==='run_code'&&e.result.result===28));
});
function judgeFor(order){return async({request})=>{order.push('judge');return {model:'typesafe/jev-1.13-20260917',privacy:'hosted-provider-visible',costMicroUsd:1,answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:id.startsWith('relevance_')&&request.state.sources?.[Number(id.split('_')[1])]?.title==='Unrelated'?0.01:0.95}:{type:'choice',choice:id==='gate'?'execute':'3',confidence:0.9,probabilities:id==='gate'?{execute:0.9,skip:0.05,answer:0.05}:{0:0,1:0,2:0,3:1}}]))}}}
test('JEV judges before external retrieval, removes irrelevant public evidence and preserves originals',async()=>{
 const state=initial(),order=[];state.brief.liveWeb=true;state.brief.publicResearch={approved:true,brief:'basil irrigation greenhouse'};let count=0;
 const result=await runPrivateResearchAgent({state,docs:[{...doc}],infer:async()=>{order.push('propose');return proposal(count++===0?'public_research':'write_report')},judge:judgeFor(order),progress:async()=>{},publicRetrieval:async input=>{order.push('retrieve');assert.deepEqual(input,{brief:'basil irrigation greenhouse'});return [{...doc,id:'unrelated',provider:'wiki',title:'Unrelated'},{...doc,id:'public',provider:'paper'}]}});
 assert.deepEqual(order.slice(0,3),['propose','judge','retrieve']);assert.deepEqual(result.map(d=>d.id),['original','public']);
 assert.ok(state.decisions.some(d=>d.step==='agent-tool'));assert.ok(state.decisions.some(d=>d.step==='source-review'));assert.ok(state.events.some(e=>e.type==='tool.call'));
});
test('unavailable JEV cannot fall back to the proposing model or execute tools',async()=>{
 const state=initial();state.brief.liveWeb=true;let proposals=0;
 await assert.rejects(runPrivateResearchAgent({state,docs:[doc],infer:async()=>{proposals++;return proposal('public_research')},judge:async()=>{throw Error('HOSTED_JEV_UNAVAILABLE')},progress:async()=>{},publicRetrieval:async()=>assert.fail('no tool execution')}),{message:'HOSTED_JEV_UNAVAILABLE'});assert.equal(proposals,1);
});
test('the proposer receives a full small source and explicit truncation metadata for long evidence',async()=>{
 for(const length of [1200,7000]){
  const state=initial(),text='x'.repeat(length-16)+'FULL SOURCE TAIL';
  await runPrivateResearchAgent({state,docs:[{...doc,text}],infer:async request=>{
   const context=JSON.parse(request.messages.at(-1).content),source=context.sources[0];
   assert.equal(source.characters,text.length);assert.equal(source.excerptTruncated,text.length>6000);
   assert.equal(source.excerpt.length,Math.min(text.length,6000));
   if(length===1200)assert.ok(source.excerpt.endsWith('FULL SOURCE TAIL'));
   return proposal('write_report');
  },judge:judgeFor([]),progress:async()=>{}});
 }
});
test('unsupported proposals and unapproved public arguments are corrected before judgment or retrieval',async()=>{
 for(const p of [{tool:'made_up_http_tool',input:{url:'https://example.com'},why:'send content'},{tool:'public_research',input:{brief:'private canary'},why:'search'}]){
  const state=initial();let calls=0;const judge=judgeFor([]);
  await runPrivateResearchAgent({state,docs:[doc],infer:async()=>calls++?proposal('write_report'):{choices:[{message:{content:JSON.stringify(p)},finish_reason:'stop'}]},judge:async input=>{if(input.request.state.proposal)assert.equal(input.request.state.proposal.tool,'write_report');return judge(input);},progress:async()=>{},publicRetrieval:async()=>assert.fail('no retrieval without approved inputs')});
  assert.equal(calls,2);assert.equal(state.events.filter(e=>e.type==='tool.call').length,0);
 }
});
test('JEV skip never runs the proposed tool and bounded limits prevent infinite loops',async()=>{
 const state=initial();let count=0;
 await assert.rejects(runPrivateResearchAgent({state,docs:[doc],infer:async()=>{count++;return proposal('write_report')},judge:async({request})=>({model:'JEV',privacy:'hosted-provider-visible',costMicroUsd:1,answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:0.9}:{type:'choice',choice:id==='gate'?'skip':'3',probabilities:id==='gate'?{execute:0,skip:1,answer:0}:{0:0,1:0,2:0,3:1}}]))}),progress:async()=>{}}),{message:'PRIVATE_AGENT_REPORT_DECLINED'});
 assert.equal(count,3);assert.equal(state.events.filter(e=>e.type==='tool.call').length,0);
});
test('a skipped public search permits a source-only report without repeating retrieval or inventing sources',async()=>{
 const state=initial();state.brief.liveWeb=true;state.brief.publicResearch={approved:true,brief:'basil irrigation'};let proposals=0;
 const base=judgeFor([]);
 const result=await runPrivateResearchAgent({state,docs:[{...doc}],infer:async()=>proposal(proposals++===0?'public_research':'write_report'),judge:async input=>{
  const result=await base(input);if(input.request.state.proposal?.tool==='public_research')result.answers.gate={type:'choice',choice:'skip',probabilities:{skip:1,execute:0,answer:0}};return result;
 },publicRetrieval:async()=>assert.fail('JEV skipped search'),progress:async()=>{}});
 assert.deepEqual(result.map(d=>d.id),['original']);assert.equal(proposals,2);
});
test('executed subtraction retains its structured result and the final limit skips another proposing call',async()=>{
 const state=initial();let count=0;
 await runPrivateResearchAgent({state,docs:[{...doc}],infer:async()=>{count++;return {choices:[{message:{content:JSON.stringify({tool:'compute',input:{operation:'subtract',values:[126,98]},why:'Check the observed difference.'})},finish_reason:'stop'}]}},judge:judgeFor([]),progress:async()=>{}});
 assert.equal(count,3);const events=state.events.filter(e=>e.tool==='compute');assert.equal(events.length,1);
 assert.ok(events.every(e=>e.result.result===28));
});
test('evidence observations survive into the next proposal and tool completion flushes progress',async()=>{
 const state=initial(),notes=[];let calls=0;
 const text='Fictional basil '.repeat(80)+'IMPORTANT END MEASUREMENT 98 litres.';
 await runPrivateResearchAgent({state,docs:[{...doc,text}],infer:async request=>{
  const context=JSON.parse(request.messages.at(-1).content);
  if(calls++===0)return {choices:[{message:{content:JSON.stringify({tool:'search_evidence',input:{query:'MEASUREMENT'},why:'Inspect the actual measurement.'})},finish_reason:'stop'}]};
  const observation=context.history[0].outcome;
  assert.equal(typeof observation,'object');assert.ok(observation.items[0].text.includes('IMPORTANT END MEASUREMENT'));
  return proposal('write_report');
 },judge:judgeFor([]),progress:async(phase,note,detail)=>{notes.push({phase,note,detail,eventCount:state.events.length})}});
 const row=state.events.find(e=>e.type==='tool.call');assert.equal(row.result.items.length,1);
 assert.ok(notes.some(n=>n.phase==='tool'&&n.detail?.origin==='tool'&&n.eventCount>0));
 assert.ok(notes.some(n=>n.detail?.origin==='model-summary'));
});
test('deep research observations remain within encrypted progress and proposal limits',async()=>{
 const state=initial();state.brief.depth='deep';let calls=0,largest=0;
 await runPrivateResearchAgent({state,docs:Array.from({length:4},(_,i)=>({...doc,id:'source-'+i,text:'evidence '.repeat(4000)})),infer:async request=>{
  assert.ok(Buffer.byteLength(JSON.stringify(request.messages))<=150000);
  return {choices:[{message:{content:JSON.stringify({tool:'search_evidence',input:{query:'evidence '+calls++},why:'Inspect another evidence selection.'})},finish_reason:'stop'}]};
 },judge:judgeFor([]),progress:async(phase,text,detail)=>{
  state.events.push({type:'thinking',phase,text,...detail});
  const bytes=Buffer.byteLength(JSON.stringify({events:state.events,decisions:state.decisions.slice(-16).map(({question,...d})=>d)}));
  largest=Math.max(bytes,largest);assert.ok(bytes<=128*1024);
 }});
 assert.ok(largest>50000);assert.equal(state.events.filter(e=>e.type==='tool.call').length,6);
});

test('non-report JEV gates cannot choose answer; an incompatible answer recovers without executing the rejected tool',async()=>{
 for(const malformed of [false,true]){
  const state=initial(),base=judgeFor([]);let calls=0,executed=0;
  const work=runPrivateResearchAgent({state,docs:[{...doc}],infer:async()=>calls++?proposal('write_report'):{choices:[{message:{content:JSON.stringify({tool:'compute',input:{operation:'subtract',values:[126,98]},why:'Check the difference.'})},finish_reason:'stop'}]},judge:async input=>{
   const gate=input.request.questions.gate;
   if(gate){const writing=input.request.state.proposal.tool==='write_report';assert.deepEqual(Object.keys(gate.criteria),writing?['execute','skip','answer']:['execute','skip']);}
   const out=await base(input);
   if(gate&&malformed&&input.request.state.proposal.tool!=='write_report')out.answers.gate={type:'choice',choice:'answer',probabilities:{answer:1}};
   return out;
  },progress:async(phase,note)=>{if(phase==='tool'&&note.startsWith('Running'))executed++;}});
  if(malformed){await work;assert.equal(executed,0);assert.ok(!state.events.some(e=>e.tool==='compute'));}else{await work;assert.equal(executed,1);assert.equal(state.events.find(e=>e.tool==='compute').result.result,28);}
 }
});

test('completed malformed proposals and invalid local inputs recover inside the original bounded run',async()=>{
 for(const kind of ['json','truncated','local-input']){
  const state=initial(),notes=[];let calls=0;
  await runPrivateResearchAgent({state,docs:[{...doc}],infer:async request=>{
   if(calls++===0)return kind==='json'?{choices:[{message:{content:'{bad JSON'},finish_reason:'stop'}]}:kind==='truncated'?{choices:[{message:{content:'{"tool":'},finish_reason:'length'}]}:{choices:[{message:{content:JSON.stringify({tool:'compute',input:{operation:'subtract',values:[126]},why:'Check the difference.'})},finish_reason:'stop'}]};
   const context=JSON.parse(request.messages.at(-1).content);assert.match(context.history.at(-1).outcome,/malformed|invalid/);
   return proposal('write_report');
  },judge:judgeFor([]),progress:async(phase,text)=>notes.push({phase,text})});
  assert.equal(calls,2);assert.ok(notes.some(n=>n.phase==='recovery'));assert.equal(state.events.filter(e=>e.type==='tool.call').length,0);
 }
});
test('automatic repair cannot retry provider errors or exceed the research bound',async()=>{
 const state=initial();let calls=0;
 await assert.rejects(runPrivateResearchAgent({state,docs:[doc],infer:async()=>{calls++;throw Error('PHALA_PRIVATE_AI_RECEIPT_FAILED')},judge:judgeFor([]),progress:async()=>{}}),{message:'PHALA_PRIVATE_AI_RECEIPT_FAILED'});assert.equal(calls,1);
 calls=0;await runPrivateResearchAgent({state:initial(),docs:[doc],infer:async()=>{calls++;return {choices:[{message:{content:'bad'},finish_reason:'stop'}]}},judge:judgeFor([]),progress:async()=>{}});assert.equal(calls,3);
});

test('invalid terminal paths recover before dispatch rather than turning a safe input error into uncertainty',async()=>{
 const state=initial(),notes=[];let calls=0,commands=0;
 await runPrivateResearchAgent({state,docs:[doc],infer:async()=>calls++?proposal('write_report'):{choices:[{message:{content:JSON.stringify({tool:'run_terminal',input:{command:'true',persist:['../outside']},why:'Persist an example.'})},finish_reason:'stop'}]},judge:judgeFor([]),runTerminal:async()=>{commands++;assert.fail('invalid paths cannot execute')},progress:async(phase,text)=>notes.push({phase,text})});
 assert.equal(commands,0);assert.equal(calls,2);assert.ok(notes.some(n=>n.phase==='recovery'&&n.text.includes('terminal')));
});

 test('no delivered evidence at the research bound requests repair instead of reporting missing upload',async()=>{
 const state=initial();state.brief.liveWeb=true;let modelCalls=0;
 await assert.rejects(runPrivateResearchAgent({state,docs:[],infer:async()=>{modelCalls++;return {choices:[{message:{content:'malformed proposal'},finish_reason:'stop'}]}},judge:judgeFor([]),progress:async()=>{},publicRetrieval:()=>assert.fail('no unapproved retrieval')}),{message:'PRIVATE_EVIDENCE_REPAIR_REQUIRED'});
 assert.equal(modelCalls,3);assert.equal(state.reports?.length??0,0);
 });

test('a specifically requested paid story is judged as an original text while unrequested irrelevant purchases remain filtered',async()=>{
 for(const requested of [true,false]){
  const url='https://creator.example/story',state=initial();state.brief.liveWeb=true;state.brief.topic=requested?`Summarize ${url} as fiction; do not treat the plot as real events.`:'Find factual evidence about basil irrigation';let calls=0,contextChecks=0;
  const judge=async input=>{const out=await judgeFor([])(input);for(const [id,q]of Object.entries(input.request.questions))if(id.startsWith('relevance_')||id.startsWith('trust_'))out.answers[id]={type:'noul',noul:0.11};if(input.request.state.scope){contextChecks++;assert.match(input.request.state.scope,/not proof that fictional events happened/);}return out;};
  const work=runPrivateResearchAgent({state,docs:[],infer:async()=>++calls===1?{choices:[{message:{content:JSON.stringify({tool:'pay_x402',input:{url:'https://creator.example/api/access',maxMicroUsd:200000},why:'Read the requested article.'})},finish_reason:'stop'}]}:proposal('write_report'),judge,progress:async()=>{},ownerQuestion:async()=>({optionId:'approve'}),externalTool:async()=>({ok:true,callId:'fixture-paid-source',costMicroUsd:200000,output:{sources:[{url,text:'An original satirical story, not empirical evidence.',title:'A satire'}]}})});
  if(requested){const docs=await work;assert.equal(docs.length,1);assert.equal(contextChecks,1);assert.equal(docs[0].trust,.95);assert.ok(state.decisions.some(d=>d.step==='source-context-review'));}else{await assert.rejects(work,/PRIVATE_EVIDENCE_REPAIR_REQUIRED/);assert.equal(contextChecks,0);}
 }
});
test('forced final step still emits model findings and operational gaps in activity before writing',async()=>{
 const state=initial(),notes=[];let reviews=0;
 const docs=[{...doc}];await runPrivateResearchAgent({state,docs,run:{},actionId:'fixture',
 infer:async()=>proposal('search_evidence'),judge:judgeFor([]),
 reviewRound:async()=>{reviews++;return {learnings:['I can compare 126 L with 98 L from the supplied pilot.'],followUps:['The chapter previews were not retrieved in full; I will not claim to have read them.']}},
 progress:async(phase,note,detail)=>notes.push({phase,note,...detail})});
 assert.equal(reviews,1);assert.ok(notes.some(n=>n.origin==='model-summary'&&n.note.includes('126 L')&&n.note.includes('not retrieved in full')));
});

test('irrelevant discovery can recover through a separately approved original page without replaying search',async()=>{
 const state=initial();state.brief.liveWeb=true;state.brief.publicResearch={approved:true,brief:'context manager protocol'};
 let proposals=0,searches=0,fetches=0;const updates=[];
 const result=await runPrivateResearchAgent({state,docs:[],run:{},actionId:'fixture',judge:judgeFor([]),progress:async(_,text)=>updates.push(text),
  infer:async request=>{proposals++;return proposals===1?proposal('public_research'):proposals===2?{choices:[{message:{content:JSON.stringify({tool:'web_fetch',input:{url:'https://docs.python.org/3/reference/compound_stmts.html',maxMicroUsd:0},why:'Read the requested original reference.'})},finish_reason:'stop'}]}:proposal('write_report');},
  ownerQuestion:async()=>({optionId:'approve'}),externalTool:async({request})=>{if(request.tool==='web_search'){searches++;return {ok:true,costMicroUsd:0,output:{sources:[{...doc,provider:'public-web',title:'Unrelated'}]}};}fetches++;return {ok:true,costMicroUsd:0,callId:'direct',output:{text:'If __enter__ returns without an error, __exit__ will always be called.',sources:[{url:request.url,title:'Python reference',text:'If __enter__ returns without an error, __exit__ will always be called.'}]}};}
 });
 assert.equal(searches,1);assert.equal(fetches,1);assert.equal(result.length,1);assert.equal(result[0].title,'Python reference');assert.ok(updates.some(x=>x.includes('no relevant evidence')));
});

test('URL-only scope blocks both search tools without dispatch and still permits an approved exact read',async()=>{
 for(const forbidden of ['public_research','web_search']){
  const state=initial();state.brief.liveWeb=true;state.brief.searchEnabled=false;let calls=0,reads=0,questions=0;
  const out=await runPrivateResearchAgent({state,docs:[],infer:async request=>{
   const context=JSON.parse(request.messages.at(-1).content);assert.equal(context.publicResearchApproved,false);
   if(calls++===0)return forbidden==='public_research'?proposal(forbidden):{choices:[{message:{content:JSON.stringify({tool:forbidden,input:{query:'not authorized',maxMicroUsd:0},why:'Search'})}}]};
   if(calls===2)return {choices:[{message:{content:JSON.stringify({tool:'web_fetch',input:{url:'https://example.org/source',maxMicroUsd:0},why:'Read the exact original'})}}]};
   return proposal('write_report');
  },judge:judgeFor([]),progress:async()=>{},publicRetrieval:()=>assert.fail('search must not leave worker'),ownerQuestion:async question=>{questions++;assert.equal(question.externalRequest.tool,'web_fetch');return {optionId:'approve'}},externalTool:async({request})=>{reads++;assert.equal(request.tool,'web_fetch');return {ok:true,callId:'read',costMicroUsd:0,output:{sources:[{url:request.url,title:'Original',text:'Original evidence.'}]}}}});
  assert.equal(reads,1);assert.equal(questions,1);assert.equal(out.length,1);assert.equal(state.events.filter(e=>e.type==='tool.call').length,1);
 }
});

test('new exact URL reads preserve bounded decision slots for a corrected terminal action',async()=>{
 const state=initial();state.brief.liveWeb=true;state.brief.searchEnabled=false;state.brief.topic='Verify Python using https://one.example/article and https://two.example/reference';let proposals=0,terminals=0;const base=judgeFor([]);
 await runPrivateResearchAgent({state,docs:[],directReadsFirst:true,infer:async()=>{
  proposals++;return {choices:[{message:{content:JSON.stringify(proposals<=2?{tool:'run_code',input:{code:'return "not executed"',data:{}},why:'Unsuitable placeholder'}:{tool:'run_terminal',input:{command:'python3 -c "print(28)"'},why:'Execute the Python check'})},finish_reason:'stop'}]};
 },judge:async input=>{const out=await base(input);if(input.request.state.proposal?.tool==='run_code')out.answers.gate={type:'choice',choice:'skip',probabilities:{execute:0,skip:1}};return out;},ownerQuestion:async()=>({optionId:'approve'}),externalTool:async({request})=>({ok:true,costMicroUsd:0,callId:request.url,output:{text:'Official Python context management protocol.'}}),runCode:async()=>assert.fail('skipped code cannot run'),runTerminal:async()=>{terminals++;return{stdout:'28\n',stderr:'',exitCode:0,seconds:0.01,artifacts:{}}},progress:async()=>{}});
 assert.equal(proposals,3);assert.equal(terminals,1);assert.equal(state.events.filter(e=>e.type==='tool.call'&&e.tool==='web_fetch').length,2);assert.ok(state.events.some(e=>e.type==='tool.call'&&e.tool==='run_terminal'&&e.result.stdout==='28\n'));
});
