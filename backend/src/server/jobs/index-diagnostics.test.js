import { it, expect, afterEach } from 'vitest';
import { recordIndexDiagnostic, indexFailure, observeIndexStage, takeIndexDiagnostics } from './index-diagnostics.js';
import { runIndexBatches } from './index-batches.js';
afterEach(() => takeIndexDiagnostics());
it('retains only allowlisted fields and never error payloads', () => {
 const secret = 'SECRET_TOKEN_cookie_key_URL';
 indexFailure('inspection', { status: 403, message: secret, body: { token: secret }, url: secret, headers: { authorization: secret } });
 recordIndexDiagnostic(secret, 'accepted', 200);
 recordIndexDiagnostic('oauth', secret, 200);
 const rows = takeIndexDiagnostics();
 expect(rows).toEqual([{stage:'inspection',outcome:'http_failure',status:403,count:1}]);
 expect(JSON.stringify(rows)).not.toContain(secret);
 expect(takeIndexDiagnostics()).toEqual([]);
});
it('preserves returned values, thrown error identity, and calls operation once', async () => {
 let calls=0; const error=Object.assign(Error('private'), {code:'ETIMEDOUT'});
 await expect(observeIndexStage('inspection',async()=>{calls++;throw error;})).rejects.toBe(error);
 expect(calls).toBe(1);
 expect(await observeIndexStage('oauth',async()=>42)).toBe(42);
 expect(takeIndexDiagnostics().map(x=>x.outcome)).toEqual(['timeout','accepted']);
});
it('caps row cardinality and count magnitude', () => {
 for(let code=100;code<=599;code++) recordIndexDiagnostic('inspection','accepted',code,Number.MAX_SAFE_INTEGER);
 const rows=takeIndexDiagnostics();expect(rows).toHaveLength(64);
 expect(rows.every(x=>x.count===1_000_000)).toBe(true);
});
it('distinguishes inherited failures without generating new provider requests',async()=>{
 let calls=0;let saved='old';
 await expect(runIndexBatches({cursor:JSON.stringify({after:'b',failures:['a']}),checkpoint:async v=>{saved=v;},fetchSites:async()=>['a','b','c'],inspectSite:async()=>{calls++;return {errors:[]};}})).rejects.toThrow('1 sites');
 const rows=takeIndexDiagnostics();expect(calls).toBe(1);expect(saved).toBeNull();
 expect(rows).toContainEqual({stage:'batch',outcome:'inherited_failures',status:null,count:1});
 expect(rows.some(x=>x.outcome==='new_failures')).toBe(false);
});
it('records new failures separately and keeps checkpoint failure semantics',async()=>{
 const error=Error('private database URL');
 await expect(runIndexBatches({cursor:null,checkpoint:async()=>{throw error;},fetchSites:async()=>['a'],inspectSite:async()=>({indexNowErrors:1})})).rejects.toBe(error);
 const rows=takeIndexDiagnostics();expect(rows.some(x=>x.outcome==='new_failures')).toBe(true);
 expect(rows.some(x=>x.outcome==='database_failure')).toBe(true);
 expect(JSON.stringify(rows)).not.toContain('private');
});
