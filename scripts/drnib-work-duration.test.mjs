import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-work-duration.ts',import.meta.url),'utf8');
const {drNibWorkDuration}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const now=Date.parse('2026-10-19T00:00:00Z'),activeWork={format:'drnib-active-work-v1',durationMs:65000,observedAt:new Date(now).toISOString(),running:true};
test('duration updates while working and freezes for questions, pauses, terminal states and recovery',()=>{
 const run={status:'running',activeWork};assert.equal(drNibWorkDuration(run,now+2000).label,'1m 7s');
 for(const status of ['awaiting','paused','complete','ended','failed'])assert.equal(drNibWorkDuration({...run,status},now+86400000).ms,65000);
 assert.equal(drNibWorkDuration(run,now+86400000,true).ms,65000);
 assert.equal(drNibWorkDuration({...run,metadata:{privateRecoveryRequestId:'saved'}},now+86400000).ms,65000);
 assert.equal(drNibWorkDuration({...run,activeWork:{...activeWork,running:false}},now+86400000).ms,65000);
});
test('stale observations never count hours offline and legacy history is not guessed',()=>{
 assert.equal(drNibWorkDuration({status:'running',activeWork},now+86400000).ms,95000);
 assert.equal(drNibWorkDuration({status:'running',activeWork},now-1000).ms,65000);
 assert.equal(drNibWorkDuration({createdAt:new Date(0).toISOString()}),null);
 assert.equal(drNibWorkDuration({activeWork:{...activeWork,durationMs:NaN}}),null);
});
