import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateWorkflow} from './private-workflow.js';
const state={status:'intake',brief:{topic:'Fictional irrigation study'}};
const question={key:'follow-up_scope',type:'pick_one',prompt:'Who will use this?',options:[{id:'a',label:'Researchers'},{id:'b',label:'Growers'}]};
test('empty or unusable opening questions never silently become a generic question bank',async()=>{
 for(const value of [{questions:[]},{questions:[{bad:'shape'}]},{other:[]}]){
  const workflow=createPrivateWorkflow({infer:async()=>({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}),judge:()=>assert.fail('No invented judgment')});
  await assert.rejects(workflow({state,action:'intake'}),{message:'PRIVATE_INTAKE_INVALID'});
 }
});
test('the original opener proposes model questions without a premature stop judgment',async()=>{
 const workflow=createPrivateWorkflow({infer:async()=>({choices:[{message:{content:JSON.stringify({questions:[question]})},finish_reason:'stop'}]}),judge:()=>assert.fail('The original opener does not judge whether to stop')});
 const out=await workflow({state,action:'intake'});
 assert.equal(out.state.status,'intake');assert.equal(out.state.questions.length,1);assert.equal(out.state.decisions.filter(d=>d.kind==='question').length,1);
 const skipped=await workflow({state:out.state,action:'finish-intake'});assert.equal(skipped.state.status,'intake-done');
});
test('durable progress precedes inference and a progress storage failure prevents spending',async()=>{
 const order=[];
 const workflow=createPrivateWorkflow({infer:async()=>{order.push('infer');return {choices:[{message:{content:JSON.stringify({questions:[question]})},finish_reason:'stop'}]};}});
 await workflow({state,action:'intake',onProgress:async snapshot=>{order.push('progress');assert.equal(snapshot.events[0].phase,'intake');assert.ok(!JSON.stringify(snapshot).includes(state.brief.topic));}});
 assert.deepEqual(order,['progress','infer']);
 await assert.rejects(workflow({state,action:'intake',onProgress:async()=>{throw Error('snapshot unavailable')}}));
 assert.deepEqual(order,['progress','infer']);
});
test('private web approval is validated before spending on a research plan',async()=>{
 const workflow=createPrivateWorkflow({infer:async()=>{assert.fail('Invalid approval must not dispatch paid inference')},publicRetrieval:async()=>[]});
 for(const approval of [{approved:false,brief:'public research'},{approved:true,brief:'x'.repeat(401)},{approved:true,brief:'public research',hiddenDocument:'private'}]){
  await assert.rejects(workflow({state:{...state,status:'intake-done'},action:'configure',args:{budgetCap:1,liveWeb:true,publicResearch:approval}}),{message:'PRIVATE_TOOL_DISCLOSURE_REQUIRED'});
 }
});
test('private intake accepts the hyphenated key shape requested by the shared prompt',async()=>{
    const workflow=createPrivateWorkflow({infer:async request=>{assert.equal(request.json,true);return {choices:[{message:{content:JSON.stringify({questions:[question]})},finish_reason:'stop'}]};}});
    const result=await workflow({state,action:'intake'});
    assert.equal(result.state.questions[0].key,'follow-up-scope');
    assert.equal(result.state.status,'intake');
});
test('private structured-output failures distinguish truncation and malformed JSON without echoing content',async()=>{
    for(const [response,code] of [[{choices:[{message:{content:'secret'},finish_reason:'length'}]},'PRIVATE_MODEL_OUTPUT_TRUNCATED'],[{choices:[{message:{content:'secret'},finish_reason:'stop'}]},'PRIVATE_INTAKE_INVALID']]){
        const workflow=createPrivateWorkflow({infer:async()=>response});
        await assert.rejects(workflow({state,action:'intake'}),error=>error.message===code);
    }
});
test('the shared acknowledgement prompt receives the actual answered questions',async()=>{
    const workflow=createPrivateWorkflow({infer:async request=>{
        if(request.stage==='intake')return {choices:[{message:{content:'{"questions":[]}'},finish_reason:'stop'}]};
        const prompt=request.messages.map(m=>m.content).join('\n');
        assert.ok(prompt.includes('Question asked: Who will use this?'));
        assert.ok(!prompt.includes('Question asked: (unknown)'));
        return {choices:[{message:{content:'The report will focus on greenhouse growers.'},finish_reason:'stop'}]};
    },judge:async()=>({model:'fixture',costMicroUsd:0,answers:{'intake-stop':{type:'choice',choice:'proceed'}}})});
    const result=await workflow({state:{brief:state.brief,status:'intake',questions:[question],decisions:[{kind:'question',seq:1,question}]},action:'answers',args:{answers:[{seq:1,answer:{optionIds:['b']}}]}});
    assert.equal(result.state.status,'intake-done');
    assert.equal(result.state.thinking,'The report will focus on greenhouse growers.');
});
test('the original JEV stop decision asks another batch, then proceeds',async()=>{
 let intakeCalls=0,judgeCalls=0;
 const followup={key:'evidence',type:'pick_one',prompt:'Which evidence should be prioritized?',options:[{id:'studies',label:'Studies'},{id:'reports',label:'Reports'}],allowOther:true};
 const workflow=createPrivateWorkflow({infer:async request=>({choices:[{message:{content:request.stage==='intake'?JSON.stringify({questions:++intakeCalls===1?[followup]:[]}):'I will use your answers.'},finish_reason:'stop'}]}),judge:async({request})=>{
  judgeCalls++;assert.match(request.questions['intake-stop'].instructions,/Diminishing returns are real/);
  assert.ok(request.state.includes('Answered:'));return {model:'fixture',costMicroUsd:0,answers:{'intake-stop':{type:'choice',choice:judgeCalls===1?'ask_more':'proceed'}}};
 }});
 const first=await workflow({state:{...state,questions:[{...question,seq:0}],decisions:[{kind:'question',seq:0,question:{...question,seq:0}}]},action:'answers',args:{answers:[{seq:0,answer:{optionIds:['b']}}]}});
 assert.equal(first.state.status,'intake');assert.equal(first.state.questions.length,1);assert.equal(first.state.questions[0].seq,1);assert.equal(first.state.questions[0].key,'evidence');
 const second=await workflow({state:first.state,action:'answers',args:{answers:[{seq:1,answer:{optionIds:['studies']}}]}});
 assert.equal(second.state.status,'intake-done');assert.equal(second.state.questions.length,0);assert.equal(second.state.decisions.filter(d=>d.kind==='question'&&d.answer).length,2);assert.equal(judgeCalls,2);
});
test('the original stop decision reframes using the prior questions',async()=>{
 let calls=0;
 const revised={key:'reframed',type:'pick_one',prompt:'Which outcome should the work prioritize?',options:[{id:'a',label:'Clarity'},{id:'b',label:'Practical steps'}]};
 const workflow=createPrivateWorkflow({infer:async request=>{
  if(request.stage==='thinking')return {choices:[{message:{content:'Noted.'},finish_reason:'stop'}]};
  calls++;if(calls===2)assert.ok(JSON.stringify(request.messages).includes('answers do not converge on anything plannable'));
  return {choices:[{message:{content:JSON.stringify({questions:calls===2?[revised]:[]})},finish_reason:'stop'}]};
 },judge:async()=>({model:'fixture',costMicroUsd:0,answers:{'intake-stop':{type:'choice',choice:'reframe'}}})});
 const out=await workflow({state:{...state,questions:[{...question,seq:0}],decisions:[{kind:'question',seq:0,question:{...question,seq:0}}]},action:'answers',args:{answers:[{seq:0,answer:{optionIds:['a']}}]}});
 assert.equal(out.state.status,'intake');assert.equal(out.state.questions[0].key,'reframed');assert.equal(out.state.questions[0].seq,1);assert.equal(calls,2);
});
test('the original eight-question threshold prevents endless follow-up batches',async()=>{
 const decisions=Array.from({length:8},(_,i)=>({kind:'question',seq:i,question:{...question,key:`q${i}`,seq:i},...(i<7?{answer:{optionIds:['a'],text:''}}:{})}));
 const workflow=createPrivateWorkflow({infer:async request=>({choices:[{message:{content:request.stage==='intake'?'{"questions":[]}':'Noted.'},finish_reason:'stop'}]}),judge:async()=>({model:'fixture',costMicroUsd:0,answers:{'intake-stop':{type:'choice',choice:'ask_more'}}})});
 const out=await workflow({state:{...state,questions:[decisions[7].question],decisions},action:'answers',args:{answers:[{seq:7,answer:{optionIds:['a']}}]}});
 assert.equal(out.state.status,'intake-done');assert.deepEqual(out.state.questions,[]);assert.equal(out.state.decisions.filter(d=>d.kind==='question').length,8);
 const decision=out.state.decisions.find(d=>d.step==='intake-stop');assert.equal(decision.output.modelChoice,'ask_more');assert.equal(decision.output.decision,'proceed');assert.equal(decision.output.capped,true);assert.equal(decision.output.cap,8);
});
test('an unavailable JEV is not replaced by a generic question bank or invented decision',async()=>{
 const workflow=createPrivateWorkflow({infer:async request=>({choices:[{message:{content:request.stage==='intake'?'{"questions":[]}':'Noted.'},finish_reason:'stop'}]}),judge:async()=>{throw Error('HOSTED_JEV_UNAVAILABLE')}});
 await assert.rejects(workflow({state:{...state,questions:[{...question,seq:0}],decisions:[{kind:'question',seq:0,question:{...question,seq:0}}]},action:'answers',args:{answers:[{seq:0,answer:{optionIds:['a']}}]}}),{message:'HOSTED_JEV_UNAVAILABLE'});
});

test('a missing source blocks private planning before model dispatch',async()=>{
 const workflow=createPrivateWorkflow({infer:()=>assert.fail('no source must not spend')});
 await assert.rejects(workflow({state:{...state,status:'intake-done'},action:'configure',args:{budgetCap:1,liveWeb:false}}),{message:'PRIVATE_SOURCE_REQUIRED'});
});
test('parser failures have fixed authenticated finality before any research inference',async()=>{
 const workflow=createPrivateWorkflow({infer:()=>assert.fail('invalid input must not spend'),parser:()=>{throw Error('PRIVATE_FILENAME_CANARY provider-shaped parse detail')}});
 await assert.rejects(workflow({state:{...state,status:'planned',budgetCap:0.25,plan:{sub_questions:['Inspect the supplied measurements']}},action:'execute',sources:[{id:'source',name:'invalid.pdf',bytes:4,contentBase64:Buffer.from('fake').toString('base64')}]}),{message:'PRIVATE_SOURCE_INVALID'});
});
test('chat cost notes use metered per-call metadata, including zero cost and sponsored treatment',async()=>{
 const {PRIVATE_USAGE,PRIVATE_METERED_COST,PRIVATE_CALL_CHARGE}=await import('./phala-ai-port.js');
 for(const cost of [0,37]){
  const result={choices:[{message:{content:JSON.stringify({questions:[question]})},finish_reason:'stop'}]};
  Object.defineProperty(result,PRIVATE_USAGE,{value:{model:'qwen/reviewed',inputTokens:10,outputTokens:5}});Object.defineProperty(result,PRIVATE_METERED_COST,{value:cost});Object.defineProperty(result,PRIVATE_CALL_CHARGE,{value:{callId:'fixture-call-'+cost,billingKind:'platform',costMicroUsd:cost}});
  const out=await createPrivateWorkflow({infer:async()=>result})({state,action:'intake'});
  const notes=out.state.events.filter(e=>e.origin==='usage');assert.equal(notes.length,1);assert.equal(notes[0].costUsd,cost/1000000);assert.equal(notes[0].billingKind,'platform');assert.equal(notes[0].model,'qwen/reviewed');assert.equal(notes[0].id,'usage:fixture-call-'+cost);
 }
});

test('JEV receives actual question and answer context, not just opaque keys or a batch count',async()=>{
 const workflow=createPrivateWorkflow({infer:async request=>({choices:[{message:{content:request.stage==='intake'?'{"questions":[]}':'The research will serve greenhouse growers.'},finish_reason:'stop'}]}),judge:async({request})=>{assert.match(request.state,/Who will use this\?/);assert.match(request.state,/Growers/);assert.match(request.state,/Actual answered context/);assert.doesNotMatch(request.state,/Still open: purpose/);return {model:'fixture',costMicroUsd:0,answers:{'intake-stop':{type:'choice',choice:'proceed'}}}}});
 const out=await workflow({state:{...state,questions:[{...question,seq:0}],decisions:[{kind:'question',seq:0,question:{...question,seq:0}}]},action:'answers',args:{answers:[{seq:0,answer:{optionIds:['b']}}]}});
 assert.equal(out.state.status,'intake-done');assert.deepEqual(out.state.questions,[]);
});
test('a generated follow-up batch cannot exceed the remaining eight-question allowance',async()=>{
 const decisions=Array.from({length:7},(_,i)=>({kind:'question',seq:i,question:{...question,key:'scope-'+i,seq:i},...(i<6?{answer:{optionIds:['a'],text:''}}:{})}));
 const workflow=createPrivateWorkflow({infer:async request=>({choices:[{message:{content:request.stage==='intake'?JSON.stringify({questions:Array.from({length:5},(_,i)=>({key:'new-'+i,type:'pick_one',prompt:'Which greenhouse constraint remains essential '+i+'?',options:[{id:'a',label:'Winter heating'},{id:'b',label:'Water use'}]}))}):'The scope is clear.'},finish_reason:'stop'}]}),judge:async()=>({model:'fixture',costMicroUsd:0,answers:{'intake-stop':{type:'choice',choice:'ask_more'}}})});
 const out=await workflow({state:{...state,decisions,questions:[decisions[6].question]},action:'answers',args:{answers:[{seq:6,answer:{optionIds:['a']}}]}});
 assert.equal(out.state.questions.length,1);assert.equal(out.state.decisions.filter(d=>d.kind==='question').length,8);assert.ok(out.state.questions.every(q=>q.source==='confidential-model'));
});
