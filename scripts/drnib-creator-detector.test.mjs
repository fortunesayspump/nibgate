import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
test('the worker detector matches the extension and local deterministic JEV sources',async()=>{
 const evidence=JSON.parse(await readFile(new URL('../dr-nib/backend/src/privacy/creator-page-model.sources.json',import.meta.url)));
 for(const [path,expected] of Object.entries(evidence.sources))assert.equal(createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex'),expected,'Rebuild the shared creator detector after changing '+path);
 assert.equal(createHash('sha256').update(await readFile(new URL('../dr-nib/backend/src/privacy/creator-page-model.generated.js',import.meta.url))).digest('hex'),evidence.generatedSha256);
});
