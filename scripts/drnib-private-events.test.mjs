import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
test('private activity batches history, survives shrinking progress and recovers without duplicate pollers',async()=>{
 const previousMode=process.env.NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL,previousTimer=globalThis.setTimeout,previousClear=globalThis.clearTimeout;
 const scheduled=[],events=[],errors=[];let snapshot={events:Array.from({length:40},(_,i)=>({id:String(i)}))},fail=false;
 process.env.NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL='true';
 globalThis.setTimeout=fn=>{scheduled.push(fn);return fn;};globalThis.clearTimeout=fn=>{const index=scheduled.indexOf(fn);if(index>=0)scheduled.splice(index,1)};
 globalThis.__drNibEventsTest={getPrivateManifest:async()=>{if(fail)throw Error('network unavailable');return {value:snapshot};}};
 try{
  let source=await readFile(new URL('../frontend/src/lib/dr-nib-events.ts',import.meta.url),'utf8');
  source=source.replace(/^import .*;\r?\n/gm,'').replace("await import('./dr-nib-private-records')",'globalThis.__drNibEventsTest');
  const helpers=(await readFile(new URL('../frontend/src/lib/dr-nib-private-action-updates.ts',import.meta.url),'utf8'));
  const js=ts.transpileModule(helpers+'\nconst DRNIB_API_BASE="unused";\n'+source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
  const {subscribeRunEvents,notifyPrivateActionUpdate}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
  const stop=subscribeRunEvents('run',e=>events.push(e),()=>errors.push('disconnected'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(events.length,1);assert.equal(events[0].privateSnapshot,snapshot);assert.equal(scheduled.length,1);
  await scheduled.shift()();assert.equal(events.length,1); // unchanged 40 historical rows
  snapshot={events:[{id:'1'}]};await scheduled.shift()();assert.equal(events.length,2);
  snapshot={events:[{id:'1'},{id:'new'}]};await scheduled.shift()();assert.equal(events.length,3);
  fail=true;await scheduled.shift()();await scheduled.shift()();assert.equal(errors.length,1);assert.equal(scheduled.length,1);
  fail=false;await scheduled.shift()();assert.equal(events.length,4); // recovered even with identical content
  notifyPrivateActionUpdate('other');assert.equal(events.length,4);
  notifyPrivateActionUpdate('run');assert.equal(events.at(-1).type,'private.action-settled');assert.equal(events.length,5);assert.equal(scheduled.length,1);
  stop();assert.equal(scheduled.length,0);notifyPrivateActionUpdate('run');assert.equal(events.length,5);
 }finally{globalThis.setTimeout=previousTimer;globalThis.clearTimeout=previousClear;delete globalThis.__drNibEventsTest;if(previousMode===undefined)delete process.env.NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL;else process.env.NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL=previousMode;}
});
