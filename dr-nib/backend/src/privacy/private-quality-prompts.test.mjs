import test from 'node:test';import assert from 'node:assert/strict';
import {roundReviewMessages,reportMessages,briefSummary} from '../llm/prompts.js';
test('new review includes stored text past the old preview and distinguishes retrieval from search excerpts',()=>{
 const text='Intro. '+'x'.repeat(3500)+' PRECONDITION: setup must succeed.';
 const messages=roundReviewMessages({brief:{qualityPolicyVersion:2},round:1,sources:[{title:'Official',text,excerpt:text.slice(0,100),evidenceKind:'owner-approved-public-response',availableCharacters:text.length}]});
 assert.ok(messages[1].content.includes('PRECONDITION: setup must succeed.'));assert.ok(messages[1].content.includes('already fetched'));assert.ok(messages[1].content.includes('Do not request another fetch'));
 const legacy=roundReviewMessages({brief:{},sources:[{text,excerpt:'preview'}]});assert.ok(!legacy[1].content.includes('PRECONDITION'));
});
test('new writer reconciles overbroad source guarantees and respects URL-only scope',()=>{
 const brief={qualityPolicyVersion:2,liveWeb:true,searchEnabled:false};
 assert.match(briefSummary(brief),/search are disabled/);
 assert.match(reportMessages({brief,sources:[],targetWords:300})[1].content,/preconditions, exceptions and scope/);
});
