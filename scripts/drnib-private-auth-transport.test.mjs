import test from 'node:test';import assert from 'node:assert/strict';
import {localAuthTransport} from './drnib-private-auth-transport.mjs';
const hub='https://testnet-api.nibgate.xyz',service='https://nibgatebackend-production.up.railway.app';
test('only the existing service and exact auth routes may replace the unavailable custom-domain transport',()=>{
 assert.equal(localAuthTransport(hub+'/api/auth/me',service),service+'/api/auth/me');
 assert.equal(localAuthTransport(hub+'/auth/verify',service),service+'/auth/verify');
 for(const url of [hub+'/hub/search',hub+'/api/auth/me?private=canary','https://example.com/api/auth/me'])assert.equal(localAuthTransport(url,service),url);
 for(const origin of ['http://nibgatebackend-production.up.railway.app','https://example.com',service+'/path',service+'@example.com'])assert.throws(()=>localAuthTransport(hub+'/api/auth/me',origin));
 assert.equal(localAuthTransport(hub+'/api/auth/me'),hub+'/api/auth/me');
 const request=new Request(hub+'/api/auth/me');assert.equal(localAuthTransport(request,service),request);
});
