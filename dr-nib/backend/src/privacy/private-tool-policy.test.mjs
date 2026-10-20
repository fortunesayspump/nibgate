import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateToolPolicy} from './private-tool-policy.js';
test('private evidence and bounded calculations run without an external port',async()=>{
 const tools=createPrivateToolPolicy({sources:[{id:'a',text:'Synthetic apples cost 4 units.'},{id:'b',text:'Synthetic pears cost 6 units.'}]});
 assert.deepEqual(await tools.run('compute',{operation:'sum',values:[4,6]}),{result:10});
 assert.deepEqual(await tools.run('compute',{operation:'subtract',values:[126,98]}),{result:28});
 assert.deepEqual(await tools.run('compute',{operation:'subtract',values:[98,126]}),{result:-28});
 await assert.rejects(tools.run('compute',{operation:'subtract',values:[126]}));
 await assert.rejects(tools.run('compute',{operation:'subtract',values:[126,98,1]}));
 assert.equal((await tools.run('search_evidence',{query:'apples'}))[0].sourceId,'a');
 await assert.rejects(tools.run('compute',{operation:'eval',values:[4]}));
 await assert.rejects(tools.run('compute',{operation:'sum',values:[Infinity]}));
 await assert.rejects(tools.run('compute',{operation:'sum',values:[1],code:'fetch(secret)'}));
});
test('network, payment, MCP and arbitrary-code tools cannot consume private context',async()=>{
 const tools=createPrivateToolPolicy();
 for(const name of ['http_request','web_search','web_fetch','run_code','tip_creator','unlock_content','pay_x402','rate_content','write_file','mcp'])await assert.rejects(tools.run(name,{query:'SYNTHETIC_PRIVATE_CANARY',url:'https://example.invalid'}),{message:'PRIVATE_TOOL_DISCLOSURE_REQUIRED'});
 await assert.rejects(tools.run('unknown',{}),{message:'PRIVATE_TOOL_UNAVAILABLE'});
});
test('public retrieval gets only the exact approved brief and rejects hidden context',async()=>{
 const sent=[],tools=createPrivateToolPolicy({sources:[{text:'SYNTHETIC_PRIVATE_CANARY'}],publicRetrieval:async input=>{sent.push(input);return []}});
 await assert.rejects(tools.publicResearch({approved:false,brief:'public research'}));
 await assert.rejects(tools.publicResearch({approved:true,brief:'public research',document:'SYNTHETIC_PRIVATE_CANARY'}));
 assert.deepEqual(await tools.publicResearch({approved:true,brief:'public research'}),[]);
 assert.deepEqual(sent,[{brief:'public research'}]);assert.equal(Object.isFrozen(sent[0]),true);
 assert.ok(!JSON.stringify(sent).includes('SYNTHETIC_PRIVATE_CANARY'));
});
