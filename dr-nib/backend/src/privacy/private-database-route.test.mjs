import test from 'node:test';import assert from 'node:assert/strict';
import {privateDatabaseRoute} from './private-database-route.js';
test('explicit testnet transport preserves identity, schema and TLS settings',()=>{
 const input='postgresql://synthetic%40user:synthetic%25password@postgres.railway.internal:5432/railway?schema=drnib&sslmode=require';
 const before=new URL(input),after=new URL(privateDatabaseRoute(input,'testnet-existing-proxy'));
 assert.equal(after.hostname,'hayabusa.proxy.rlwy.net');assert.equal(after.port,'23580');
 for(const k of ['protocol','username','password','pathname','search'])assert.equal(after[k],before[k]);
 assert.equal(privateDatabaseRoute(input,undefined),input);
 assert.throws(()=>privateDatabaseRoute(input,'mainnet'),/PRIVATE_DATABASE_ROUTE_UNAVAILABLE/);
 assert.throws(()=>privateDatabaseRoute('https://example.invalid','testnet-existing-proxy'),/PRIVATE_DATABASE_ROUTE_UNAVAILABLE/);
});

test('public database transport requires TLS',()=>{
 assert.equal(new URL(privateDatabaseRoute('postgresql://u:p@postgres.railway.internal/db?schema=drnib','testnet-existing-proxy')).searchParams.get('sslmode'),'require');
 assert.throws(()=>privateDatabaseRoute('postgresql://u:p@postgres.railway.internal/db?sslmode=disable','testnet-existing-proxy'),/PRIVATE_DATABASE_TLS_REQUIRED/);
});
