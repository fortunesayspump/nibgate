import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-private-funding.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{privateFundingShape,requirePrivateResearchInputs}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('confirmed private deposit reaches the existing escrow gate and wallet retry contract',()=>{
 const address='0x'+'1'.repeat(40),job={jobId:'7',client:address,provider:address,evaluator:address,status:'Funded',budget:0.2,core:address,splitConfirmed:false};
 const out=privateFundingShape({configured:true,job,ledger:{deposited:0.2}});
 assert.equal(out.job.chain.status,'Funded');assert.equal(out.job.chain.budget,0.2);assert.equal(out.job.chain.client,address);assert.equal(out.job.core,address);assert.equal(out.ledger.deposited,0.2);
 assert.equal(privateFundingShape({job:{...job,status:'Open',budget:0}}).job.chain.status,'Open');
 assert.deepEqual(privateFundingShape({configured:true,job:null}),{configured:true,job:null});
 assert.throws(()=>privateFundingShape({job:{...job,budget:'0.2'}}));assert.throws(()=>privateFundingShape({job:{...job,client:'wrong'}}));
});

test('an absent upload or unapproved search cannot reach planning or wallet funding',()=>{
 const source={id:'a'.repeat(8)+'-aaaa-4aaa-8aaa-'+ 'a'.repeat(12),name:'synthetic.txt',bytes:12};
 for(const brief of [{liveWeb:false},{liveWeb:true},{liveWeb:true,publicResearch:{approved:false,brief:'synthetic'}}])assert.throws(()=>requirePrivateResearchInputs(brief,[]));
 assert.doesNotThrow(()=>requirePrivateResearchInputs({liveWeb:false},[source]));
 assert.throws(()=>requirePrivateResearchInputs({liveWeb:false},[{...source,bytes:0}]));
 assert.doesNotThrow(()=>requirePrivateResearchInputs({liveWeb:true,publicResearch:{approved:true,brief:'synthetic public query'}},[]));
});
test('URL-only readiness does not require a search query or silently authorize search',()=>{
 assert.doesNotThrow(()=>requirePrivateResearchInputs({liveWeb:true,searchEnabled:false},[]));
 assert.throws(()=>requirePrivateResearchInputs({liveWeb:false,searchEnabled:false},[]));
 assert.throws(()=>requirePrivateResearchInputs({liveWeb:true,searchEnabled:true},[]));
});
