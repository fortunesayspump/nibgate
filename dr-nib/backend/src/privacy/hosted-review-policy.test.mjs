import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedJevReviewPolicy} from './hosted-review-policy.js';

test('a verified hosted review remains valid without a daily expiry',()=>{
  const env={PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT:'2026-01-01T00:00:00Z',PRIVATE_HOSTED_JEV_CONTEXT_DISCLOSURE:'openrouter-and-typesafe',PRIVATE_HOSTED_JEV_ZDR_VERIFIED:'true'};
  assert.equal(hostedJevReviewPolicy(env).loggingReviewExpiresAtMs,null);
  assert.throws(()=>hostedJevReviewPolicy({...env,PRIVATE_HOSTED_JEV_ZDR_VERIFIED:'false'}),/review unavailable/);
  assert.throws(()=>hostedJevReviewPolicy({...env,PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT:'invalid'}),/review unavailable/);
  assert.throws(()=>hostedJevReviewPolicy({...env,PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT:'2999-01-01T00:00:00Z'}),/review unavailable/);
});
