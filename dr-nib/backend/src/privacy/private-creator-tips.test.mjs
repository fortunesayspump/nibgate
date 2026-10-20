import test from 'node:test';import assert from 'node:assert/strict';
import {creatorTipAllocation,runPrivateCreatorTips} from './private-creator-tips.js';
import {assessPublicCreatorPage} from './public-creator-detection.js';
const source=(id,url=`https://creator${id}.example/post`)=>({id:String(id),title:'Original tutorial',url,trust:.9,creatorAssessment:{source:'extension-page-model',eligible:true,kind:'content',author:'Ada'}});
const state=()=>({brief:{tipCreators:true,liveWeb:true},budgetCap:.25,plan:{estimate:.03},events:[],decisions:[]});
const report={markdown:'A useful finding [1]. A second finding [2].\n\n## References\nUncited [3].',citations:[source(1),source(2),source(3)]};
test('tip allocations retain estimates and all unresolved commitments, even with tiny budgets',()=>{
 for(let cap=1;cap<=300;cap++)for(let commitments=0;commitments<=cap*1000;commitments+=Math.max(1,Math.floor(cap*1000/9))){
  const a=creatorTipAllocation({capUsd:cap/1000,estimateUsd:cap/2000,fundedMicroUsd:cap*1000,committedMicroUsd:commitments,count:12});
  assert.ok(a.perCreatorMicroUsd*12<=a.tipPoolMicroUsd);assert.ok(a.tipPoolMicroUsd<=Math.floor(cap*1000/5));assert.ok(a.tipPoolMicroUsd+a.researchReserveMicroUsd<=Math.max(a.researchReserveMicroUsd,cap*1000-commitments));
 }
 for(const patch of [{committedMicroUsd:-1},{fundedMicroUsd:NaN},{capUsd:Infinity},{estimateUsd:.3},{count:13}])assert.throws(()=>creatorTipAllocation({capUsd:.25,estimateUsd:.03,fundedMicroUsd:250000,committedMicroUsd:1000,count:2,...patch}),/PRIVATE_TIP_BUDGET_INVALID/);
});
test('every qualifying cited creator receives a JEV-selected affordable proposal, never an uncited source',async()=>{
 const s=state(),requests=[],tips=[];
 await runPrivateCreatorTips({state:s,report,docs:report.citations,run:{id:'synthetic'},actionId:'synthetic',progress:async()=>{},readBudget:async()=>({fundedMicroUsd:250000,committedMicroUsd:7000,remainingApprovals:12}),judge:async({request})=>{assert.equal(request.state.budget.researchReserveMicroUsd,30000);assert.match(request.state.preference,/favor a positive affordable tip/i);assert.match(request.questions.eligible.instructions,/Original fiction, satire/);assert.match(request.questions.eligible.instructions,/Paid access is separate/);assert.match(request.questions.amount.instructions,/not the minimum amount by default/);return {model:'synthetic-jev',privacy:'hosted-provider-visible',costMicroUsd:0,answers:{eligible:{type:'choice',choice:'eligible',probabilities:{eligible:1,ineligible:0}},amount:{type:'choice',choice:'25000',probabilities:{25000:1}}}}},ownerQuestion:async q=>{requests.push(q);return {optionId:'approve'}},externalTool:async({request})=>{tips.push(request);return {ok:true,costMicroUsd:request.maxMicroUsd,output:{txHash:'synthetic'}}}});
 assert.equal(tips.length,2);assert.equal(tips.reduce((n,t)=>n+t.maxMicroUsd,0),50000);assert.deepEqual(tips.map(t=>t.url),report.citations.slice(0,2).map(s=>s.url));assert.equal(requests.length,2);assert.ok(s.events.every(e=>e.costUsd===.025));
});
test('tips disabled, source-only research, declined approval and exhausted budgets do not dispatch payments',async()=>{
 for(const mode of ['disabled','source-only','declined','exhausted','no-approvals']){
  const s=state();if(mode==='disabled')s.brief.tipCreators=false;if(mode==='source-only')s.brief.liveWeb=false;let payments=0;
  await runPrivateCreatorTips({state:s,report,docs:[],run:{},progress:async()=>{},readBudget:async()=>({fundedMicroUsd:250000,committedMicroUsd:mode==='exhausted'?249999:0,remainingApprovals:mode==='no-approvals'?0:12}),judge:async()=>({model:'synthetic',privacy:'synthetic',costMicroUsd:0,answers:{eligible:{choice:'eligible'},amount:{choice:'25000'}}}),ownerQuestion:async()=>({optionId:'decline'}),externalTool:async()=>{payments++;throw Error('must not pay')}});assert.equal(payments,0);
 }
});
test('the extension detector recognizes original articles and rejects feeds without executing page scripts',async()=>{
 const prose='We measured water use and greenhouse crop harvest carefully. '.repeat(75);
 const article=await assessPublicCreatorPage({url:'https://creator.example/tutorial',html:`<html><head><title>Original irrigation tutorial</title><meta name="author" content="Ada"></head><body><article><h1>Original irrigation tutorial</h1><p>${prose}</p><script>throw Error('page script must never run')</script></article></body></html>`});
 assert.equal(article.source,'extension-page-model');assert.equal(article.kind,'content');assert.equal(article.eligible,true);assert.equal(article.author,'Ada');
 const feed=await assessPublicCreatorPage({url:'https://creator.example/',html:'<html><head><title>Home</title></head><body><main>'+Array.from({length:10},(_,i)=>`<article><h2><a href="/post-${i}">Story ${i}</a></h2><p>Short teaser preview text here.</p></article>`).join('')+'</main></body></html>'});
 assert.equal(feed.eligible,false);assert.equal((await assessPublicCreatorPage({url:'http://127.0.0.1',html:prose})).eligible,false);
});
test('later report versions cannot reset the aggregate creator-tip pool or ignore uncertain tips',()=>{
 const input={capUsd:.25,estimateUsd:.03,fundedMicroUsd:250000,committedMicroUsd:40000,tippedMicroUsd:40000,count:2};
 assert.equal(creatorTipAllocation(input).tipPoolMicroUsd,10000);assert.equal(creatorTipAllocation({...input,committedMicroUsd:50000,tippedMicroUsd:50000}).tipPoolMicroUsd,0);assert.throws(()=>creatorTipAllocation({...input,tippedMicroUsd:40001}),/PRIVATE_TIP_BUDGET_INVALID/);
});

test('shared article assessment returns bounded article text without navigation or scripts',async()=>{
 const prose='Python context managers implement __enter__ and __exit__ for deterministic cleanup. '.repeat(100);
 const result=await assessPublicCreatorPage({url:'https://creator.example/context-managers',html:`<html><head><title>Python context managers</title><meta name="author" content="Ada"></head><body><nav>${'UNRELATED NAVIGATION '.repeat(150)}</nav><article><h1>Python context managers</h1><p>${prose}</p><pre>with open(path) as file:\n    print(file.read())</pre><script>PAGE_SCRIPT_CANARY</script></article><footer>FOOTER_CANARY</footer></body></html>`});
 assert.ok(result.readableText.includes('__enter__'));assert.ok(result.readableText.includes('with open(path)'));assert.ok(result.readableText.length<=24000);
 for(const canary of ['UNRELATED NAVIGATION','PAGE_SCRIPT_CANARY','FOOTER_CANARY'])assert.ok(!result.readableText.includes(canary));
});

test('a JEV skip recommendation parks for the opted-in owner instead of silently ending tipping',async()=>{
 for(const optionId of ['approve','decline']){
  const s=state();s.brief.topic='Summarize this original creative work';let questions=0,payments=0;
  await runPrivateCreatorTips({state:s,report:{markdown:'Original text [1].',citations:[source(1)]},docs:[source(1)],run:{},progress:async()=>{},readBudget:async()=>({fundedMicroUsd:250000,committedMicroUsd:200000,remainingApprovals:12}),judge:async({request})=>{assert.equal(request.state.researchQuestion,s.brief.topic);assert.ok(request.state.reportExcerpt.includes('[1]'));return {model:'synthetic',answers:{eligible:{choice:'ineligible'},amount:{choice:'20000'}}}},ownerQuestion:async question=>{questions++;assert.match(question.why,/JEV recommends skipping/);assert.equal(question.externalRequest.maxMicroUsd,20000);return {optionId}},externalTool:async()=>{payments++;return {ok:true,costMicroUsd:20000,output:{held:true}}}});
  assert.equal(questions,1);assert.equal(payments,optionId==='approve'?1:0);
 }
});
