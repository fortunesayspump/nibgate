import test from 'node:test';import assert from 'node:assert/strict';
import{privatePaidResourceUrl}from'./private-paid-resource.js';
const article='https://creator.example/writing/offline-information';
const access='https://creator.example/api/nibgate/access?path=%2Fwriting%2Foffline-information';
test('the real creator SDK canonical resource matches only the article named in approved access URL',()=>{
 assert.equal(privatePaidResourceUrl(access,'/writing/offline-information'),article);
 assert.equal(privatePaidResourceUrl(access,article),article);
 assert.equal(privatePaidResourceUrl(access,access),access);
 assert.equal(privatePaidResourceUrl(article,'/writing/offline-information'),article);
 assert.equal(privatePaidResourceUrl(article,undefined),article);
});
test('cross-site, substituted, credentialed, fragmented and ambiguous payment resources are rejected',()=>{
 for(const [request,resource] of [
  [access,'https://other.example/writing/offline-information'],[access,'/writing/another-article'],
  [access,'//other.example/writing/offline-information'],[access,'https://user:password@creator.example/writing/offline-information'],
  [access,article+'#section'],[access+'&path=%2Fwriting%2Fother',article],[access+'&extra=1',article],
  [access.replace('%2Fwriting%2Foffline-information','%2F%2Fother.example%2Fwriting'),article],
  [access.replace('%2Fwriting%2Foffline-information','%2F%5Cother.example%2Fwriting'),article],
  ['https://creator.example/other-api?path=%2Fwriting%2Foffline-information',article],
  ['https://creator.example/api/data','/writing/offline-information'],[access,{}],[access,''],
 ]) assert.throws(()=>privatePaidResourceUrl(request,resource),/PRIVATE_PAID_RESOURCE_MISMATCH/);
});
