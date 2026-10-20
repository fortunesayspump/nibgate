import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateWorkflow} from './private-workflow.js';
const state={status:'intake',brief:{topic:'Fictional irrigation study'}};
const question={key:'follow-up_scope',type:'pick_one',prompt:'Who will use this?',options:[{id:'a',label:'Researchers'},{id:'b',label:'Growers'}]};
test('explicit empty intake is valid but malformed questions cannot become a silent skip',async()=>{
 const workflow=createPrivateWorkflow({infer:async()=>({choices:[{message:{content:'{"questions":[]}'},finish_reason:'stop'}]}),judge:()=>assert.fail('No empty JEV batch')});
 const out=await workflow({state,action:'intake'});assert.equal(out.state.status,'intake-done');assert.deepEqual(out.state.questions,[]);assert.ok(out.state.events.some(e=>e.text.includes('ready for planning')));
 for(const value of [{questions:[{bad:'shape'}]},{other:[]}]){
  await assert.rejects(createPrivateWorkflow({infer:async()=>({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]})})({state,action:'intake'}),{message:'PRIVATE_INTAKE_INVALID'});
 }
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
        const prompt=request.messages.map(m=>m.content).join('\n');
        assert.ok(prompt.includes('Question asked: Who will use this?'));
        assert.ok(!prompt.includes('Question asked: (unknown)'));
        return {choices:[{message:{content:'The report will focus on greenhouse growers.'},finish_reason:'stop'}]};
    }});
    const result=await workflow({state:{brief:state.brief,status:'intake',questions:[question],decisions:[{kind:'question',seq:1,question}]},action:'answers',args:{answers:[{seq:1,answer:{optionIds:['b']}}]}});
    assert.equal(result.state.status,'intake-done');
    assert.equal(result.state.thinking,'The report will focus on greenhouse growers.');
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
