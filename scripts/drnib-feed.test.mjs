import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript'),source=await readFile(new URL('../frontend/src/lib/dr-nib-feed.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{drNibFeedKey,privateResearchActivity,drNibToolFailed,deduplicateDrNibRows,drNibHasPendingQuestion,drNibQuestionMarker}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('late history and refreshed costs preserve chat identity; newly arrived events get new identities',()=>{
 const old={t:'progress-note',at:'2026-10-19T16:00:00Z',e:{type:'thinking',phase:'search',origin:'tool',costUsd:0}};
 const key=drNibFeedKey(old);assert.equal(drNibFeedKey({...old,e:{...old.e,costUsd:0.000001}}),key);
 assert.notEqual(drNibFeedKey({...old,at:'2026-10-19T16:00:01Z'}),key);
 assert.equal(drNibFeedKey({t:'qa',at:'old',d:{id:'question'}}),drNibFeedKey({t:'qa',at:'new',d:{id:'question'}}));
});
test('animated activity follows actual progress phase and ends on pause or completion',()=>{
 const events=[{type:'thinking',phase:'search'},{type:'thinking',origin:'usage',phase:'agent'}];
 assert.equal(privateResearchActivity({status:'running',events}).label,'Searching approved public sources');
 assert.equal(privateResearchActivity({status:'running',events:[]}).label,'Preparing the next research step');
 for(const status of ['paused','awaiting','complete','failed','planned'])assert.equal(privateResearchActivity({status,events}),null);
});

test('tool status distinguishes successful native commands, failed exits and empty search results',()=>{
 assert.equal(drNibToolFailed({tool:'run_terminal',result:{exitCode:0}}),false);
 assert.equal(drNibToolFailed({tool:'run_terminal',result:{exitCode:1}}),true);
 assert.equal(drNibToolFailed({tool:'run_terminal',result:{exitCode:0,timedOut:true}}),true);
 assert.equal(drNibToolFailed({tool:'public_research',result:{count:0}}),false);
 assert.equal(drNibToolFailed({tool:'run_code',result:{ok:false,error:'timeout'}}),true);
 assert.equal(drNibToolFailed({ok:false}),true);
});

test('checkpoint replay cannot render or count a saved call ID twice; separate calls remain',()=>{
 const first={id:'usage:paid-call',costUsd:0.01},legacy={text:'without id'};
 assert.deepEqual(deduplicateDrNibRows([first,{...first},legacy,{...legacy},{id:'usage:new-call',costUsd:0.01}]),[first,legacy,legacy,{id:'usage:new-call',costUsd:0.01}]);
});

test('historical question pauses never direct users to a missing or already submitted question',()=>{
 const question={id:'q1',prompt:'Which source?'},event={question},run={status:'awaiting',pendingQuestion:question};
 assert.equal(drNibHasPendingQuestion(run),true);assert.match(drNibQuestionMarker(run,event),/answer below/);
 for(const changed of [{...run,status:'paused'},{...run,status:'complete'},{...run,pendingQuestion:null},{...run,pendingQuestion:{id:'q1',prompt:' '}},{...run,metadata:{privateActiveRequestId:'answer-in-flight'}}]){
  assert.equal(drNibHasPendingQuestion(changed),false);assert.doesNotMatch(drNibQuestionMarker(changed,event),/answer below/);
 }
 assert.doesNotMatch(drNibQuestionMarker(run,{question:{...question,id:'old'}}),/answer below/);
});
