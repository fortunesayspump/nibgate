import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivatePublicRetrieval} from './private-public-retrieval.js';
const snippet='A synthetic public paper describes remote attestation methods and their limitations.';
const result={url:'https://evidence.example.com/paper',title:'Public paper',snippet,provider:'synthetic'};
test('private web port accepts only the explicit search brief and strips unrelated headers',async()=>{
    const sent=[],requests=[];
    const search=async(input,{fetchImpl})=>{sent.push(input);await fetchImpl('https://search.example.com/',{headers:{authorization:'SYNTHETIC_SECRET'}});return {results:[result]}};
    const retrieve=createPrivatePublicRetrieval({searchers:[search],fetchPublic:async(url,options)=>{requests.push({url,options});return new Response('{}')},extract:async()=>({documents:[]})});
    await assert.rejects(retrieve({brief:'public attestation',document:'SYNTHETIC_PRIVATE_CANARY'}));
    await assert.rejects(retrieve({brief:'x'.repeat(401)}));
    const docs=await retrieve({brief:'public attestation'});
    assert.deepEqual(sent,[{query:'public attestation',maxResults:4}]);
    assert.ok(!JSON.stringify(requests).includes('SYNTHETIC_SECRET'));
    assert.equal(docs[0].text,snippet);assert.equal(docs[0].evidenceKind,'search-excerpt');
});
test('evidence selection mixes providers instead of favoring the fastest provider',async()=>{
    const searchers=['encyclopedia','papers','bibliography'].map(provider=>async()=>({results:Array.from({length:4},(_,i)=>({...result,url:`https://${provider}.example.com/${i}`,provider}))}));
    const retrieve=createPrivatePublicRetrieval({searchers,extract:async()=>({documents:[]})});
    const docs=await retrieve({brief:'public attestation'});
    assert.deepEqual(docs.map(d=>d.searchProvider),['encyclopedia','papers','bibliography','encyclopedia','papers','bibliography']);
});
test('private web collection deduplicates, excludes local destinations and caps extracted evidence',async()=>{
    const retrieve=createPrivatePublicRetrieval({searchers:[async()=>({results:[result,result,{...result,url:'https://127.0.0.1/private'},{...result,url:'http://evidence.example.com/'},{...result,url:'https://user:pass@evidence.example.com/'}]})],extract:async input=>{assert.deepEqual(input.urls,[result.url]);return {documents:[{url:result.url,text:'x'.repeat(15000)}]}}});
    const docs=await retrieve({brief:'public attestation'});assert.equal(docs.length,1);assert.equal(docs[0].text.length,12000);assert.equal(docs[0].evidenceKind,'page-text');
});
test('a hung search provider cannot hold completed public evidence past the shared deadline',async()=>{
    const started=Date.now();let extracted=false;
    const retrieve=createPrivatePublicRetrieval({deadlineMs:100,searchers:[async()=>({results:[result]}),()=>new Promise(()=>{})],extract:async()=>{extracted=true;return {documents:[]}}});
    const docs=await retrieve({brief:'public attestation'});assert.equal(docs[0].text,snippet);assert.equal(extracted,false);assert.ok(Date.now()-started<1000);
});
test('web failures remain fixed errors and never echo search exceptions',async()=>{
    const retrieve=createPrivatePublicRetrieval({searchers:[async()=>{throw Error('SYNTHETIC_PRIVATE_CANARY')}],extract:async()=>({documents:[]})});
    await assert.rejects(retrieve({brief:'public attestation'}),{message:'PRIVATE_WEB_UNAVAILABLE'});
});
test('a slow page cannot discard another page already extracted before the deadline',async()=>{
 const retrieve=createPrivatePublicRetrieval({deadlineMs:100,searchers:[async()=>({results:[result]})],extract:async(_input,{onDocument})=>{onDocument({url:result.url,text:'A complete original public article with substantive evidence.',creatorAssessment:{source:'extension-page-model',eligible:true,kind:'content'}});return new Promise(()=>{})}});
 const docs=await retrieve({brief:'public attestation'});assert.equal(docs[0].evidenceKind,'page-text');assert.equal(docs[0].creatorAssessment.eligible,true);
});

test('specific public query matches take extraction slots before unrelated provider results',async()=>{
 const irrelevant=Array.from({length:8},(_,i)=>({...result,title:'Python home page',snippet:'Learn the Python language.',url:`https://broad.example.com/${i}`}));
 const relevant={...result,title:'Python context manager tutorial',snippet:'Using __enter__ and __exit__ for cleanup.',url:'https://creator.example.com/context-managers'};let extracted;
 const retrieve=createPrivatePublicRetrieval({searchers:[async()=>({results:[...irrelevant,relevant]})],extract:async input=>{extracted=input.urls;return {documents:[]}}});
 const docs=await retrieve({brief:'Python context manager tutorial',preferCreators:true});assert.equal(extracted[0],relevant.url);assert.equal(docs[0].url,relevant.url);
});

 test('creator preference favors a relevant Hub result on a relevance tie, never an irrelevant one',async()=>{
  let extracted;const row=(provider,title,url)=>({...result,provider,title,url,snippet:'An original practical article with substantive evidence and instructions.'});
  const retrieve=createPrivatePublicRetrieval({searchers:[async()=>({results:[row('web','Python cleanup guide','https://web.example.com/guide'),row('nibgate-hub','Gardening article','https://hub.example.com/garden'),row('nibgate-hub','Python cleanup guide','https://hub.example.com/guide')]})],extract:async input=>{extracted=input.urls;return {documents:[]}}});
  await retrieve({brief:'Python cleanup guide',preferCreators:true});
  assert.deepEqual(extracted,['https://hub.example.com/guide','https://web.example.com/guide','https://hub.example.com/garden']);
  await retrieve({brief:'Python cleanup guide'});assert.equal(extracted[0],'https://web.example.com/guide');
 });
