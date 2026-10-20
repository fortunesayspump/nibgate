import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const source=readFileSync(new URL('../frontend/src/lib/dr-nib-private-public-tip.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const {privatePublicTipResource}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('Hub tip payload contains only the chosen public source, never a private fragment or project fields',()=>{
 assert.deepEqual(privatePublicTipResource('https://papers.example.com/study#PRIVATE_FRAGMENT'),{url:'https://papers.example.com/study',domain:'papers.example.com',title:'',price:'0'});
});
test('local, authenticated and unsupported source URLs cannot open the public payment flow',()=>{
 for(const url of ['http://papers.example.com','https://127.0.0.1','https://[::1]','https://localhost','https://host.internal','https://user:secret@papers.example.com','file:///private/source','not-a-url'])assert.equal(privatePublicTipResource(url),null);
});
