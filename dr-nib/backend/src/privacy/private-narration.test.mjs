import test from'node:test';import assert from'node:assert/strict';import{privateNarrationMessages}from'./private-narration.js';
test('private writing keeps substantive limitations while moving tool failures into encrypted activity',()=>{
 const source=[{role:'system',content:'Base research policy'},{role:'user',content:'Evidence'}];const out=privateNarrationMessages('write',source);
 assert.equal(out.length,3);assert.deepEqual([out[0],out[2]],source);assert.match(out[1].content,/operational updates belong in activity chat/);assert.match(out[1].content,/confounding, uncertainty/);assert.match(out[1].content,/Never conceal a missing basis/);assert.equal(source.length,2);
});
test('proposal/review summaries are grounded public updates rather than hidden reasoning or extra inference calls',()=>{
 assert.match(privateNarrationMessages('agent',[])[0].content,/last recorded result/);assert.match(privateNarrationMessages('review',[])[0].content,/unavailable full text/);assert.match(privateNarrationMessages('review',[])[0].content,/Never expose hidden/);assert.deepEqual(privateNarrationMessages('verify',[]),[]);
});
