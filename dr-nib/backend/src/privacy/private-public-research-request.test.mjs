import test from'node:test';import assert from'node:assert/strict';
import {requestPreapprovedPublicResearch}from'./private-public-research-request.js';
import {validatePrivateExternalRequest}from'@nibgate/internal/private-tools.js';
test('initial discovery uses the existing public tool and only the setup-approved query and creator preference',async()=>{
 const approval={approved:true,brief:'public programming tutorials'},sent=[];
 const sources=[{id:'public',url:'https://creator.example.com/article',text:'Substantive public article evidence.',creatorAssessment:{source:'extension-page-model',eligible:true,kind:'content'}}];
 const result=await requestPreapprovedPublicResearch({approval,preferCreators:true,ownerQuestion:async q=>{sent.push(q.externalRequest);return {optionId:'approve'}},externalTool:async({request})=>{assert.deepEqual(request,sent[0]);return {ok:true,costMicroUsd:0,output:{sources}}}});
 assert.deepEqual(sent,[{maxMicroUsd:0,preferCreators:true,query:approval.brief,tool:'web_search'}]);assert.deepEqual(result,sources);
 for(const request of [{tool:'web_search',query:'public query',maxMicroUsd:0,preferCreators:'yes'},{tool:'tip_creator',url:'https://creator.example.com/article',maxMicroUsd:1000,preferCreators:true}])assert.throws(()=>validatePrivateExternalRequest(request));
 await assert.rejects(requestPreapprovedPublicResearch({approval:{approved:false,brief:approval.brief},ownerQuestion:async()=>assert.fail('must not disclose'),externalTool:()=>{}}),/PRIVATE_TOOL_DISCLOSURE_REQUIRED/);
 const declined=await requestPreapprovedPublicResearch({approval,ownerQuestion:async()=>({optionId:'decline'}),externalTool:()=>assert.fail('no public dispatch')});assert.deepEqual(declined,[]);
});
