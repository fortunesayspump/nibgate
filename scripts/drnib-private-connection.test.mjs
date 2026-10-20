import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText).toString('base64');
const progressUrl=moduleUrl(await readFile(new URL('../frontend/src/lib/dr-nib-private-connection.ts',import.meta.url),'utf8'));
const progress=await import(progressUrl);
test('connection state is ephemeral, reactive and leaves other active runs visible',()=>{
 let notifications=0;const unsubscribe=progress.subscribePrivateConnection(()=>notifications++);
 assert.equal(progress.getPrivateConnection(),null);assert.equal(progress.getServerPrivateConnection(),null);
 progress.privateConnectionProgress('first','starting');assert.deepEqual(progress.getPrivateConnection(),{runId:'first',phase:'starting'});
 progress.privateConnectionProgress('second','verifying');progress.privateConnectionProgress('second',null);assert.equal(progress.getPrivateConnection().runId,'first');
 progress.privateConnectionProgress('first',null);assert.equal(progress.getPrivateConnection(),null);assert.equal(notifications,4);unsubscribe();
});
test('waking and verification are accessible visible states, quiet when no operation runs',async()=>{
 // Render the component with a synchronous store snapshot, without opening a
 // network connection or changing the production server/hydration snapshot.
 let source=await readFile(new URL('../frontend/src/components/dr-nib/PrivateWorkerStatus.tsx',import.meta.url),'utf8');
 const hookUrl='data:text/javascript;base64,'+Buffer.from('export const useSyncExternalStore=(_subscribe,getSnapshot)=>getSnapshot();').toString('base64');
 source=source.replace("from 'react'",`from '${hookUrl}'`).replace("'@/lib/dr-nib-private-connection'",JSON.stringify(progressUrl));
 for(const name of ['lucide-react','react/jsx-runtime'])source=source.replaceAll(`from '${name}'`,`from '${pathToFileURL(require.resolve(name)).href}'`);
 // The JSX transform adds its runtime import after source replacement.
 let js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 const {default:Component}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const {renderToStaticMarkup}=require('react-dom/server');
 assert.equal(Component(),null);
 for(const [phase,label]of [['connecting','Connecting to private worker'],['starting','Waking private worker'],['draining','Waiting for private worker to restart'],['verifying','Verifying secure connection']]){
  progress.privateConnectionProgress('fixture',phase);const html=renderToStaticMarkup(Component());assert.ok(html.includes(label));assert.ok(html.includes('role="status"'));assert.ok(html.includes('aria-live="polite"'));assert.ok(html.includes('motion-safe:animate-'));
 }
 progress.privateConnectionProgress('fixture',null);assert.equal(Component(),null);
});
